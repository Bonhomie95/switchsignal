/* Seeds a realistic demo dataset so every dashboard page has content.
 * Run: npm run seed   (idempotent-ish: skips if the demo product exists) */
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  competitors,
  complaints,
  db,
  jobs,
  leads,
  llmUsage,
  opportunities,
  products,
  scoutScans,
} from "../src/db";
import { leadScore } from "../src/lib/analysis/scoring";
import { normalizeComplaintVolume, opportunityScore } from "../src/lib/scout/score";

const DEMO_NAME = "Phantomshield (demo)";

function sha(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

const day = 86_400_000;
const now = Date.now();

async function main() {
  const existing = db.select().from(products).where(eq(products.name, DEMO_NAME)).get();
  if (existing) {
    console.log("Demo product already seeded — skipping. Delete it in the UI to reseed.");
    return;
  }

  // ---------- product ----------
  const profile = {
    name: DEMO_NAME,
    category: "privacy & tracker-blocking software",
    description:
      "Phantomshield blocks trackers, fingerprinting, and malicious scripts across browsers and devices, with a privacy dashboard and breach alerts.",
    features: [
      "tracker blocking",
      "fingerprint protection",
      "malware script blocking",
      "privacy dashboard",
      "breach alerts",
      "cross-device sync",
      "custom blocklists",
    ],
    persona: "privacy-conscious individuals and small teams",
    pricing: "freemium, $4/mo premium",
    differentiators: ["fully local processing", "one-click setup", "lower price"],
  };
  const productId = Number(
    db
      .insert(products)
      .values({
        name: DEMO_NAME,
        inputType: "markdown",
        rawInput:
          "# Phantomshield\n\nBlocks trackers, fingerprinting and malicious scripts. Privacy dashboard, breach alerts, cross-device sync. Freemium, $4/mo premium.",
        profileJson: JSON.stringify(profile),
        status: "ready",
      })
      .run().lastInsertRowid,
  );

  // ---------- competitors ----------
  const compDefs = [
    {
      name: "GhostBlock Pro",
      url: "https://example.com/ghostblock",
      summary: "The market leader in tracker blocking with a large extension user base.",
    },
    {
      name: "PrivacyHawk",
      url: "https://example.com/privacyhawk",
      summary: "Privacy suite with VPN bundling, aimed at consumers.",
    },
    {
      name: "ShieldWire",
      url: "https://example.com/shieldwire",
      summary: "Team-oriented privacy tool with device management.",
    },
  ];
  const compIds = compDefs.map(
    (c) =>
      Number(
        db
          .insert(competitors)
          .values({ productId, source: "auto", ...c })
          .run().lastInsertRowid,
      ),
  );

  // ---------- complaints (classified) ----------
  const complaintDefs = [
    // strong leads: paying + high intent + we fix it
    {
      comp: 0, source: "reddit" as const, author: "tabhoarder_42",
      title: "GhostBlock Pro slowing every page load — considering alternatives",
      body: "I've been on the paid plan for two years but since v9 every page takes 3+ seconds. Support keeps blaming my extensions. Genuinely looking for an alternative that doesn't tank performance.",
      category: "performance", feature: "page load performance",
      payer: 0.95, intent: 0.9, fit: 0.85, sev: 0.8, sent: -0.8,
      url: "https://www.reddit.com/r/privacy/comments/demo1",
    },
    {
      comp: 0, source: "reddit" as const, author: "quietclick",
      title: "Cancelled my GhostBlock subscription today",
      body: "They raised the price to $12/mo with zero new features. I mostly need tracker blocking and breach alerts. What are you all switching to?",
      category: "pricing", feature: "subscription price",
      payer: 0.9, intent: 0.95, fit: 0.8, sev: 0.6, sent: -0.7,
      url: "https://www.reddit.com/r/privacy/comments/demo2",
    },
    {
      comp: 1, source: "hn" as const, author: "sre_dropout",
      title: "",
      body: "PrivacyHawk's fingerprint protection is basically a checkbox that does nothing — tested it against CreepJS and it failed everything. Paying for the family plan and honestly regretting it.",
      category: "missing_feature", feature: "fingerprint protection",
      payer: 0.85, intent: 0.6, fit: 0.9, sev: 0.7, sent: -0.75,
      url: "https://news.ycombinator.com/item?id=demo3",
    },
    // gap: we do NOT have this
    {
      comp: 2, source: "reddit" as const, author: "it_admin_petra",
      title: "ShieldWire still has no SSO for small teams",
      body: "We manage 40 seats and every offboarding is manual. They've promised SAML for two years. If anyone knows a privacy tool with proper SSO + SCIM, tell me — we pay per seat and would move tomorrow.",
      category: "missing_feature", feature: "sso / team management",
      payer: 1.0, intent: 0.85, fit: 0.15, sev: 0.9, sent: -0.6,
      url: "https://www.reddit.com/r/sysadmin/comments/demo4",
    },
    {
      comp: 0, source: "appstore" as const, author: "MobileMel",
      title: "[2★] iOS app forgets settings",
      body: "Every update wipes my custom blocklists. I have premium and this has happened four times now. Losing patience.",
      category: "bug_reliability", feature: "settings persistence",
      payer: 0.8, intent: 0.5, fit: 0.7, sev: 0.75, sent: -0.7,
      url: "https://apps.apple.com/us/app/demo",
    },
    {
      comp: 1, source: "appstore" as const, author: "cass_reviews",
      title: "[1★] Support never answers",
      body: "Emailed support three times about billing double-charge, no reply in 3 weeks. App itself is okay but I can't trust a company that ignores paying customers.",
      category: "support", feature: "support responsiveness",
      payer: 0.9, intent: 0.7, fit: 0.4, sev: 0.85, sent: -0.9,
      url: "https://apps.apple.com/us/app/demo2",
    },
    // gap: export
    {
      comp: 2, source: "hn" as const, author: "dataliber8",
      title: "",
      body: "Tried ShieldWire for a quarter. Wanted to leave and discovered there is NO export for your rules and history. Absolute lock-in. Never again without checking export first.",
      category: "lock_in", feature: "data export",
      payer: 0.7, intent: 0.4, fit: 0.2, sev: 0.65, sent: -0.8,
      url: "https://news.ycombinator.com/item?id=demo5",
    },
    {
      comp: 0, source: "github" as const, author: "octomirror",
      title: "Firefox container tabs bypass blocking",
      body: "Repro: enable container tabs, open any tracked site in a container — trackers load freely. Reported 8 months ago, still open. Lots of 👍 from paying users in the thread.",
      category: "bug_reliability", feature: "container tab support",
      payer: 0.6, intent: 0.45, fit: 0.75, sev: 0.7, sent: -0.5,
      url: "https://github.com/example/ghostblock/issues/1234",
    },
  ];

  const complaintIds: number[] = [];
  for (const c of complaintDefs) {
    const id = Number(
      db
        .insert(complaints)
        .values({
          productId,
          competitorId: compIds[c.comp],
          source: c.source,
          sourceUrl: c.url,
          author: c.author,
          title: c.title,
          body: c.body,
          postedAt: now - Math.floor(Math.random() * 30) * day,
          hash: sha(`demo:${c.author}:${c.title}:${c.body.slice(0, 40)}`),
          category: c.category as never,
          feature: c.feature,
          payerScore: c.payer,
          intentScore: c.intent,
          fitScore: c.fit,
          sentiment: c.sent,
          severity: c.sev,
          classificationNote: "seeded demo classification",
          status: "classified",
        })
        .run().lastInsertRowid,
    );
    complaintIds.push(id);
  }

  // ---------- leads for the contactable, high-score complaints ----------
  const leadDrafts: Record<number, { draft: string; status: "drafted" | "sent" | "converted" }> = {
    0: {
      status: "drafted",
      draft:
        "Saw your post about page loads tanking since v9 — that's rough after two years on the paid plan. I'm building Phantomshield, a tracker blocker that does all processing locally, so page-load overhead stays under ~50ms. If you want to see whether it fixes the slowdown for your setup, the trial is free and I'd genuinely value the feedback.",
    },
    1: {
      status: "drafted",
      draft:
        "Since you mainly need tracker blocking and breach alerts: I make Phantomshield, which covers exactly those two for $4/mo instead of $12. No pressure — the free tier might even be enough for your use. Happy to answer questions if you try it.",
    },
    2: {
      status: "sent",
      draft:
        "I build Phantomshield and we test our fingerprint protection against CreepJS on every release — current build passes the full suite. If you want to verify yourself, the trial is free; I'd be curious what your CreepJS run shows on your machine.",
    },
    7: {
      status: "converted",
      draft:
        "Container tabs are a first-class case in Phantomshield — we run per-container blocking contexts, so nothing bypasses. I'm the developer; if you want to test the exact repro from your issue, trial's free.",
    },
  };
  for (const [idx, l] of Object.entries(leadDrafts)) {
    const c = complaintDefs[Number(idx)];
    db.insert(leads)
      .values({
        productId,
        complaintId: complaintIds[Number(idx)],
        channel: c.source === "hn" ? "hn" : c.source === "github" ? "forum" : "reddit",
        score: leadScore({
          payerScore: c.payer,
          intentScore: c.intent,
          fitScore: c.fit,
          severity: c.sev,
        }),
        draft: l.draft,
        finalMessage: l.status !== "drafted" ? l.draft : "",
        status: l.status,
        styleVariant: (["concise", "warm", "direct", "concise"] as const)[Number(idx) % 4],
        sentAt: l.status !== "drafted" ? now - 2 * day : null,
      })
      .run();
  }

  // ---------- demo LLM usage (so the token panel has data) ----------
  for (let d = 0; d < 6; d++) {
    for (const [tag, pt, ct] of [
      ["classify", 620, 90],
      ["triage", 210, 8],
      ["draft", 540, 140],
      ["profile", 3100, 380],
    ] as const) {
      const reps = tag === "classify" ? 40 : tag === "triage" ? 80 : 6;
      for (let i = 0; i < reps; i++) {
        db.insert(llmUsage)
          .values({
            provider: "groq",
            model: "llama-3.3-70b-versatile",
            tag,
            keyId: "demo",
            promptTokens: pt,
            completionTokens: ct,
            totalTokens: pt + ct,
            createdAt: now - d * day - i * 60_000,
          })
          .run();
      }
    }
  }

  // ---------- scout scan + opportunities ----------
  const scanId = Number(
    db
      .insert(scoutScans)
      .values({ query: "privacy tools (demo)", status: "completed", resultCount: 3 })
      .run().lastInsertRowid,
  );
  const oppDefs = [
    {
      name: "InboxZeroer",
      url: "https://example.com/inboxzeroer",
      category: "email productivity",
      summary: "Solo-founder email triage SaaS, widely used by consultants.",
      claim: "$32k MRR (open dashboard)",
      reliability: "high" as const,
      rev: 0.85, payers: 0.75, complaints: 24, feas: 0.7, thin: 0.55,
      why: "Users love the concept but the iOS app crashes constantly and support is a one-person queue.",
    },
    {
      name: "FormPilot",
      url: "https://example.com/formpilot",
      category: "form builder",
      summary: "Indie form builder with strong SEO traffic and aging UI.",
      claim: "$18k MRR (self-reported, Indie Hackers)",
      reliability: "medium" as const,
      rev: 0.65, payers: 0.7, complaints: 31, feas: 0.8, thin: 0.35,
      why: "Paying users complain about missing conditional logic and a 2019-era editor; churn posts are frequent.",
    },
    {
      name: "SnapInvoice",
      url: "https://example.com/snapinvoice",
      category: "freelancer invoicing",
      summary: "Invoicing tool for freelancers, acquired-and-neglected.",
      claim: "listed at 4.2x profit on Acquire (2025)",
      reliability: "medium" as const,
      rev: 0.6, payers: 0.6, complaints: 12, feas: 0.85, thin: 0.4,
      why: "New owner stopped shipping; users report broken tax fields every January and no responses.",
    },
  ];
  for (const o of oppDefs) {
    const complaintVolume = normalizeComplaintVolume(o.complaints, 0.7);
    db.insert(opportunities)
      .values({
        scanId,
        name: o.name,
        url: o.url,
        category: o.category,
        summary: o.summary,
        revenueSignal: o.rev,
        payerVolume: o.payers,
        complaintVolume,
        feasibility: o.feas,
        competitionThinness: o.thin,
        opportunityScore: opportunityScore({
          revenueSignal: o.rev,
          payerVolume: o.payers,
          complaintVolume,
          feasibility: o.feas,
          competitionThinness: o.thin,
        }),
        revenueEvidenceJson: JSON.stringify([
          { claim: o.claim, url: o.url, source: "demo", reliability: o.reliability },
        ]),
        whyWinnable: o.why,
        status: "candidate",
      })
      .run();
  }

  // ---------- a finished job for the activity feed ----------
  db.insert(jobs)
    .values({
      type: "full_pipeline",
      payloadJson: JSON.stringify({ productId }),
      productId,
      status: "completed",
      progress: 100,
      message: "pipeline complete (demo seed)",
      createdAt: now - day,
      startedAt: now - day,
      finishedAt: now - day + 8 * 60_000,
    })
    .run();

  console.log(`Seeded demo product #${productId} with ${complaintDefs.length} complaints, ${Object.keys(leadDrafts).length} leads, ${oppDefs.length} opportunities.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
