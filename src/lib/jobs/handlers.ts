import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  competitors,
  complaints,
  db,
  leads,
  opportunities,
  products,
} from "@/db";
import {
  buildProductProfile,
  channelForSource,
  classifyComplaint,
  discoverCompetitors,
  draftReply,
  isContactableSource,
  leadScore,
  mapConcurrent,
  nextStyleVariant,
  ProductProfileSchema,
  styleExamples,
  triageComplaint,
} from "@/lib/analysis";
import { clusterProductComplaints } from "@/lib/analysis/cluster";
import { trackCompetitorPricing } from "@/lib/analysis/pricing";
import { checkHNReply, checkRedditReply, getRedditToken } from "@/lib/connectors";
import {
  budgetRemainingCalls,
  DEFAULT_DAILY_TOKEN_BUDGET,
  getSetting,
} from "@/lib/llm";
import { isNearDuplicate, simhash } from "@/lib/analysis/simhash";
import { mineCompetitor } from "@/lib/connectors";
import { runScoutScan } from "@/lib/scout";

export type Progress = (pct: number, msg: string) => void;

function sha(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export async function handleProfileProduct(productId: number, progress: Progress) {
  const product = db.select().from(products).where(eq(products.id, productId)).get();
  if (!product) throw new Error(`product ${productId} not found`);
  progress(10, "reading input & building product profile…");
  const profile = await buildProductProfile(
    product.inputType,
    product.rawInput,
  );
  db.update(products)
    .set({
      profileJson: JSON.stringify(profile),
      name: profile.name || product.name,
      status: "profiled",
      updatedAt: Date.now(),
    })
    .where(eq(products.id, productId))
    .run();
  progress(100, `profiled: ${profile.features.length} features extracted`);
}

function getProfile(productId: number) {
  const product = db.select().from(products).where(eq(products.id, productId)).get();
  if (!product?.profileJson)
    throw new Error(`product ${productId} has no profile yet`);
  return {
    product,
    profile: ProductProfileSchema.parse(JSON.parse(product.profileJson)),
  };
}

export async function handleDiscoverCompetitors(productId: number, progress: Progress) {
  const { profile } = getProfile(productId);
  progress(20, "discovering competitors…");
  const { suggestions, usedWebSearch } = await discoverCompetitors(profile);
  const existing = db
    .select({ name: competitors.name })
    .from(competitors)
    .where(eq(competitors.productId, productId))
    .all()
    .map((r) => r.name.toLowerCase());
  let added = 0;
  for (const c of suggestions.competitors) {
    if (existing.includes(c.name.toLowerCase())) continue;
    db.insert(competitors)
      .values({
        productId,
        name: c.name,
        url: c.url,
        summary: c.summary,
        featuresJson: JSON.stringify(c.features),
        pricingJson: JSON.stringify(c.pricing ? [{ plan: "listed", price: c.pricing }] : []),
        source: "auto",
      })
      .run();
    added++;
  }
  progress(
    100,
    `${added} competitors added${usedWebSearch ? " (web-search assisted)" : " (LLM knowledge — add a Brave key for search-assisted discovery)"}`,
  );
}

export async function handleMineComplaints(productId: number, progress: Progress) {
  const comps = db
    .select()
    .from(competitors)
    .where(and(eq(competitors.productId, productId), eq(competitors.status, "active")))
    .all();
  if (!comps.length) throw new Error("no active competitors to mine");
  const allWarnings: string[] = [];
  let inserted = 0;
  let dupes = 0;

  // existing simhashes for near-duplicate detection (cross-posts, copy-paste)
  const known: { id: number; sim: string }[] = db
    .select({ id: complaints.id, sim: complaints.simhash })
    .from(complaints)
    .where(eq(complaints.productId, productId))
    .all()
    .filter((r): r is { id: number; sim: string } => !!r.sim);

  for (let i = 0; i < comps.length; i++) {
    const comp = comps[i];
    progress(
      Math.round((i / comps.length) * 90),
      `mining sources for ${comp.name} (${i + 1}/${comps.length})…`,
    );
    const { items, warnings } = await mineCompetitor(comp);
    allWarnings.push(...warnings);
    for (const item of items) {
      const hash = sha(`${item.source}:${item.externalId}`);
      const sim = simhash(`${item.title} ${item.body}`);
      const dupOf = known.find((k) => isNearDuplicate(k.sim, sim));
      const res = db
        .insert(complaints)
        .values({
          productId,
          competitorId: comp.id,
          source: item.source,
          sourceUrl: item.url,
          author: item.author,
          title: item.title,
          body: item.body,
          postedAt: item.postedAt,
          hash,
          simhash: sim,
          duplicateOf: dupOf?.id ?? null,
          status: dupOf ? "skipped" : "raw",
          classificationNote: dupOf ? `near-duplicate of #${dupOf.id}` : null,
        })
        .onConflictDoNothing()
        .run();
      if (res.changes > 0) {
        if (dupOf) dupes++;
        else {
          inserted++;
          known.push({ id: Number(res.lastInsertRowid), sim });
        }
      }
    }
  }
  const dupeNote = dupes ? `, ${dupes} near-duplicates folded` : "";
  const warnNote = allWarnings.length ? ` (${allWarnings.length} source warnings: ${uniq(allWarnings).slice(0, 2).join("; ")})` : "";
  progress(100, `${inserted} new posts collected${dupeNote}${warnNote}`);
}

/** Higher = classified first when the per-run quota guard kicks in. */
const SOURCE_PRIORITY: Record<string, number> = {
  reddit: 3, // highest switch-intent posts live here
  github: 2.5,
  trustpilot: 2.5,
  hn: 2,
  appstore: 1.5,
  playstore: 1.5,
  g2: 2,
  web: 1,
  demo: 1,
};

export async function handleClassifyComplaints(
  productId: number,
  progress: Progress,
  { includeSkipped = false }: { includeSkipped?: boolean } = {},
) {
  const { profile } = getProfile(productId);

  if (includeSkipped) {
    // reset failed classifications (but never near-duplicates) back to raw
    db.update(complaints)
      .set({ status: "raw", classificationNote: null })
      .where(
        and(
          eq(complaints.productId, productId),
          eq(complaints.status, "skipped"),
          sql`${complaints.duplicateOf} is null`,
        ),
      )
      .run();
  }

  const allRaw = db
    .select()
    .from(complaints)
    .where(and(eq(complaints.productId, productId), eq(complaints.status, "raw")))
    .all();
  if (!allRaw.length) {
    progress(100, "nothing new to classify");
    return;
  }

  // Quota guard: cap by both the fixed per-run limit AND today's remaining
  // token budget (a triage+classify pair per post, conservatively).
  const dailyBudget = Number(
    getSetting("daily_token_budget") ?? DEFAULT_DAILY_TOKEN_BUDGET,
  );
  const budgetCap = budgetRemainingCalls("classify", dailyBudget);
  const maxPerRun = Math.min(
    Number(process.env.CLASSIFY_MAX_PER_RUN ?? 150),
    budgetCap,
  );
  if (maxPerRun <= 0) {
    progress(
      100,
      `daily token budget exhausted — ${allRaw.length} posts wait for tomorrow (raise the budget in Settings)`,
    );
    return;
  }
  const raw = [...allRaw]
    .sort(
      (a, b) =>
        (SOURCE_PRIORITY[b.source] ?? 1) - (SOURCE_PRIORITY[a.source] ?? 1) ||
        (b.postedAt ?? 0) - (a.postedAt ?? 0),
    )
    .slice(0, maxPerRun);
  const deferred = allRaw.length - raw.length;
  const compNames = new Map(
    db
      .select({ id: competitors.id, name: competitors.name })
      .from(competitors)
      .where(eq(competitors.productId, productId))
      .all()
      .map((r) => [r.id, r.name]),
  );

  let done = 0;
  let noise = 0;
  const concurrency = Number(process.env.CLASSIFY_CONCURRENCY ?? 8);
  await mapConcurrent(raw, concurrency, async (row) => {
    const compName = compNames.get(row.competitorId ?? -1) ?? "the competitor";
    try {
      // pass 1: cheap triage — most mined posts aren't complaints at all
      const isComplaint = await triageComplaint(compName, row);
      if (!isComplaint) {
        db.update(complaints)
          .set({
            category: "not_a_complaint",
            status: "classified",
            classificationNote: "triage: not a complaint",
          })
          .where(eq(complaints.id, row.id))
          .run();
        noise++;
      } else {
        // pass 2: full scoring, only for actual complaints
        const c = await classifyComplaint(profile, compName, {
          title: row.title,
          body: row.body,
          source: row.source,
        });
        db.update(complaints)
          .set({
            category: c.is_complaint ? c.category : "not_a_complaint",
            feature: c.feature,
            payerScore: c.payer_score,
            intentScore: c.intent_score,
            fitScore: c.fit_score,
            sentiment: c.sentiment,
            severity: c.severity,
            classificationNote: c.note,
            status: "classified",
          })
          .where(eq(complaints.id, row.id))
          .run();
      }
    } catch {
      db.update(complaints)
        .set({ status: "skipped", classificationNote: "classification failed" })
        .where(eq(complaints.id, row.id))
        .run();
    }
    done++;
    if (done % 5 === 0 || done === raw.length)
      progress(Math.round((done / raw.length) * 100), `classified ${done}/${raw.length}`);
  });

  // assign classified complaints to canonical feature clusters (local, free)
  progress(99, "clustering features…");
  await clusterProductComplaints(productId).catch(() => {});

  const parts = [`classified ${done} posts`];
  if (noise) parts.push(`${noise} filtered as noise by triage`);
  if (deferred > 0) parts.push(`${deferred} deferred (quota guard)`);
  progress(100, parts.join(" · "));
}

const LEAD_THRESHOLD = 0.25;

export async function handleGenerateLeads(productId: number, progress: Progress) {
  const { profile } = getProfile(productId);
  const qualifying = db
    .select()
    .from(complaints)
    .where(and(eq(complaints.productId, productId), eq(complaints.status, "classified")))
    .all()
    .filter(
      (c) =>
        c.category !== "not_a_complaint" &&
        isContactableSource(c.source) &&
        leadScore(c) >= LEAD_THRESHOLD,
    );

  // Author-level merging: one lead per (source, author). The strongest
  // complaint wins; extra complaints from the same person boost the score and
  // are recorded so we never contact anyone twice.
  const byAuthor = new Map<string, typeof qualifying>();
  const anonymous: typeof qualifying = [];
  for (const c of qualifying) {
    const handle = c.author?.trim().toLowerCase();
    if (!handle) {
      anonymous.push(c);
      continue;
    }
    const key = `${c.source}:${handle}`;
    (byAuthor.get(key) ?? byAuthor.set(key, []).get(key)!).push(c);
  }
  const merged: { primary: (typeof qualifying)[number]; extra: number; boost: number }[] = [];
  for (const group of byAuthor.values()) {
    group.sort((a, b) => leadScore(b) - leadScore(a));
    merged.push({
      primary: group[0],
      extra: group.length - 1,
      boost: Math.min(0.2, (group.length - 1) * 0.07),
    });
  }
  for (const c of anonymous) merged.push({ primary: c, extra: 0, boost: 0 });

  // never re-lead a complaint that already has one, and never contact an
  // author who already has any lead for this product (cross-complaint suppression)
  const existingComplaintIds = new Set<number>();
  const suppressedAuthors = new Set<string>();
  for (const l of db
    .select({ complaintId: leads.complaintId })
    .from(leads)
    .where(eq(leads.productId, productId))
    .all())
    existingComplaintIds.add(l.complaintId);
  // map existing leads' complaint authors for suppression
  const leadComplaintAuthors = db
    .select({ source: complaints.source, author: complaints.author })
    .from(leads)
    .innerJoin(complaints, eq(leads.complaintId, complaints.id))
    .where(eq(leads.productId, productId))
    .all();
  for (const r of leadComplaintAuthors)
    if (r.author?.trim())
      suppressedAuthors.add(`${r.source}:${r.author.trim().toLowerCase()}`);

  const fresh = merged.filter((m) => {
    if (existingComplaintIds.has(m.primary.id)) return false;
    const handle = m.primary.author?.trim().toLowerCase();
    if (handle && suppressedAuthors.has(`${m.primary.source}:${handle}`)) return false;
    return true;
  });
  if (!fresh.length) {
    progress(100, "no new qualifying leads");
    return;
  }

  const compNames = new Map(
    db
      .select({ id: competitors.id, name: competitors.name })
      .from(competitors)
      .where(inArray(competitors.id, [...new Set(fresh.map((m) => m.primary.competitorId ?? -1))]))
      .all()
      .map((r) => [r.id, r.name]),
  );
  // feedback flywheel: match the user's approved voice, rotate A/B styles
  const examples = styleExamples(productId);
  const variant = nextStyleVariant(productId);

  let done = 0;
  await mapConcurrent(fresh, 4, async (m) => {
    const c = m.primary;
    let draft = "";
    try {
      draft = await draftReply(
        profile,
        compNames.get(c.competitorId ?? -1) ?? "the competitor",
        c,
        variant,
        examples,
      );
    } catch {
      /* draft can be generated later from the UI */
    }
    db.insert(leads)
      .values({
        productId,
        complaintId: c.id,
        channel: channelForSource(c.source),
        score: Math.min(1, leadScore(c) + m.boost),
        draft,
        styleVariant: variant,
        mergedComplaints: m.extra + 1,
        status: draft ? "drafted" : "new",
      })
      .onConflictDoNothing()
      .run();
    done++;
    if (done % 3 === 0 || done === fresh.length)
      progress(Math.round((done / fresh.length) * 100), `drafted ${done}/${fresh.length} leads`);
  });
  const mergedCount = fresh.reduce((a, m) => a + m.extra, 0);
  progress(
    100,
    `${fresh.length} leads queued${mergedCount ? ` (${mergedCount} duplicate-author complaints merged)` : ""}`,
  );
}

/** Snapshot every active competitor's pricing and report changes. */
export async function handleTrackPricing(productId: number, progress: Progress) {
  const comps = db
    .select()
    .from(competitors)
    .where(and(eq(competitors.productId, productId), eq(competitors.status, "active")))
    .all();
  const changes: string[] = [];
  for (let i = 0; i < comps.length; i++) {
    progress(
      Math.round((i / Math.max(comps.length, 1)) * 100),
      `checking pricing for ${comps[i].name}…`,
    );
    try {
      const result = await trackCompetitorPricing(comps[i]);
      if (result?.changed && result.summary)
        changes.push(`${comps[i].name}: ${result.summary}`);
    } catch {
      /* pricing tracking is best-effort */
    }
  }
  progress(
    100,
    changes.length
      ? `pricing changes detected — ${changes.join(" · ")}`
      : "no pricing changes detected",
  );
}

/** Re-mine → classify → refresh leads → pricing check, in order, as one job. */
export async function handleRefreshData(productId: number, progress: Progress) {
  const stage = (base: number, span: number): Progress => (pct, msg) =>
    progress(base + Math.round((pct / 100) * span), msg);
  await handleMineComplaints(productId, stage(0, 45));
  await handleClassifyComplaints(productId, stage(45, 35));
  await handleGenerateLeads(productId, stage(80, 10));
  await handleTrackPricing(productId, stage(90, 10));
  progress(100, "refresh complete");
}

/** The whole Compete pipeline for one product, with staged progress. */
export async function handleFullPipeline(productId: number, progress: Progress) {
  const stage = (base: number, span: number): Progress => (pct, msg) =>
    progress(base + Math.round((pct / 100) * span), msg);
  await handleProfileProduct(productId, stage(0, 15));
  await handleDiscoverCompetitors(productId, stage(15, 15));
  await handleMineComplaints(productId, stage(30, 28));
  await handleClassifyComplaints(productId, stage(58, 27));
  await handleGenerateLeads(productId, stage(85, 8));
  await handleTrackPricing(productId, stage(93, 7));
  db.update(products)
    .set({ status: "ready", updatedAt: Date.now() })
    .where(eq(products.id, productId))
    .run();
  progress(100, "pipeline complete");
}

export async function handleScoutScan(
  payload: { scanId: number; query: string },
  progress: Progress,
) {
  const { warnings } = await runScoutScan(payload.scanId, payload.query, progress);
  if (warnings.length) progress(100, `done — ${warnings[0]}`);
}

/**
 * Poll threads for sent leads to detect replies, auto-advancing sent → replied.
 * Requires the user's reddit/hn handle in Settings.
 */
export async function handleTrackReplies(progress: Progress) {
  const redditHandle = getSetting("reddit_username")?.trim();
  const hnHandle = getSetting("hn_username")?.trim();
  if (!redditHandle && !hnHandle) {
    progress(100, "add your reddit/hn username in Settings to track replies");
    return;
  }
  const sent = db
    .select({ lead: leads, complaint: complaints })
    .from(leads)
    .innerJoin(complaints, eq(leads.complaintId, complaints.id))
    .where(eq(leads.status, "sent"))
    .all();
  if (!sent.length) {
    progress(100, "no sent leads awaiting replies");
    return;
  }
  const token = await getRedditToken().catch(() => null);
  let advanced = 0;
  for (let i = 0; i < sent.length; i++) {
    const { lead, complaint } = sent[i];
    progress(Math.round((i / sent.length) * 100), `checking replies (${i + 1}/${sent.length})…`);
    let result: "replied" | "no_reply" | "unknown" = "unknown";
    if (lead.channel === "reddit" && redditHandle && complaint.sourceUrl) {
      result = await checkRedditReply(complaint.sourceUrl, redditHandle, token);
    } else if (lead.channel === "hn" && hnHandle) {
      const hnId = complaint.sourceUrl.match(/id=(\d+)/)?.[1];
      if (hnId) result = await checkHNReply(hnId, hnHandle);
    }
    if (result === "replied") {
      db.update(leads)
        .set({ status: "replied", updatedAt: Date.now() })
        .where(eq(leads.id, lead.id))
        .run();
      advanced++;
    }
  }
  progress(100, advanced ? `${advanced} lead(s) advanced to replied` : "no new replies detected");
}

/** Scout → Compete hand-off: adopt an opportunity as a new product. */
export function adoptOpportunity(opportunityId: number): number {
  const opp = db
    .select()
    .from(opportunities)
    .where(eq(opportunities.id, opportunityId))
    .get();
  if (!opp) throw new Error(`opportunity ${opportunityId} not found`);
  const productName = `${opp.name} competitor`;
  const res = db
    .insert(products)
    .values({
      name: productName,
      inputType: "form",
      rawInput: `# ${productName}\n\nA better alternative to ${opp.name} (${opp.url}).\nCategory: ${opp.category}\nTarget product summary: ${opp.summary}\nWhy winnable: ${opp.whyWinnable}\n\nOur differentiators: fix the top complaints about ${opp.name}.`,
      status: "profiling",
    })
    .run();
  const productId = Number(res.lastInsertRowid);
  db.insert(competitors)
    .values({
      productId,
      name: opp.name,
      url: opp.url,
      summary: opp.summary,
      source: "scout",
    })
    .run();
  db.update(opportunities)
    .set({ status: "adopted", productId })
    .where(eq(opportunities.id, opportunityId))
    .run();
  return productId;
}

function uniq(arr: string[]): string[] {
  return [...new Set(arr)];
}
