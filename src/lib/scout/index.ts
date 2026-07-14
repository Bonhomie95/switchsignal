import { db, opportunities, scoutScans } from "@/db";
import { mineAppStore, mineHN, webSearch, hasSearchKey } from "@/lib/connectors";
import { completeJSON } from "@/lib/llm";
import { ScoutCandidatesSchema } from "@/lib/analysis/schemas";
import { desc, eq, sql } from "drizzle-orm";
import { normalizeComplaintVolume, opportunityScore, round2 } from "./score";
import { type Evidence, verifyEvidence } from "./verify";

export * from "./score";

const SYSTEM = `You are a startup market scout. Given a category/keyword (and optional web-search evidence), identify REAL, existing small software products that plausibly have solid revenue with a small team (high revenue, low expenses) AND visible customer dissatisfaction — i.e., products worth building a better competitor to.

Only name products you are confident actually exist. Prefer products with public revenue claims (Indie Hackers, open-startup pages, acquisition listings, founder interviews). Be honest about evidence reliability: "high" only for verified/open dashboards, "medium" for self-reported claims, "low" for inference from traction.

Respond with ONLY JSON:
{"candidates": [{
  "name": string, "url": string, "category": string,
  "summary": string (1-2 sentences),
  "revenue_claim": string (e.g. "$25k MRR self-reported, 2023"),
  "revenue_evidence": [{"claim": string, "url": string, "source": string, "reliability": "low"|"medium"|"high"}],
  "revenue_signal": 0..1, "payer_volume": 0..1, "feasibility": 0..1 (1 = a solo dev could rebuild the core in months),
  "competition_thinness": 0..1 (1 = few strong alternatives),
  "why_winnable": string (1-2 sentences citing the dissatisfaction)
}]}
Return 4-8 candidates, best first.`;

export async function runScoutScan(
  scanId: number,
  query: string,
  onProgress?: (pct: number, msg: string) => void,
): Promise<{ count: number; warnings: string[] }> {
  const warnings: string[] = [];
  db.update(scoutScans).set({ status: "running" }).where(eq(scoutScans.id, scanId)).run();

  // 1) Gather public revenue evidence via web search (when a key exists).
  onProgress?.(10, "searching for revenue evidence…");
  let evidence = "";
  if (hasSearchKey()) {
    const queries = [
      `site:indiehackers.com ${query} MRR`,
      `site:acquire.com ${query}`,
      `${query} "open startup" revenue`,
      `${query} saas "k MRR"`,
    ];
    const lines: string[] = [];
    for (const q of queries) {
      const results = await webSearch(q, { count: 6 });
      lines.push(...results.map((r) => `- ${r.title} | ${r.url} | ${r.snippet}`));
    }
    evidence = lines.join("\n").slice(0, 7000);
  } else {
    warnings.push("no Brave search key — Scout is using LLM knowledge only; add a free key in Settings for evidence-backed results");
  }

  // 2) LLM proposes candidates with evidence + signal estimates.
  onProgress?.(30, "identifying candidates…");
  const { candidates } = await completeJSON(
    {
      tag: "scout",
      system: SYSTEM,
      prompt: `Category/keyword: ${query}\n${evidence ? `\nWeb search evidence:\n${evidence}` : ""}\n\nList the candidates.`,
      temperature: 0.3,
      maxTokens: 3000,
    },
    ScoutCandidatesSchema,
  );

  // 3) Measure real complaint volume per candidate (free sources, fast pass).
  let done = 0;
  for (const c of candidates) {
    onProgress?.(
      30 + Math.round((done / Math.max(candidates.length, 1)) * 60),
      `measuring complaints for ${c.name}…`,
    );
    let complaintCount = 0;
    try {
      const [hn, app] = await Promise.allSettled([
        mineHN(c.name, { maxHits: 30 }),
        mineAppStore(c.name, { pages: 1 }),
      ]);
      if (hn.status === "fulfilled") complaintCount += hn.value.items.length;
      if (app.status === "fulfilled") complaintCount += app.value.items.length;
    } catch {
      /* volume stays 0 */
    }
    const complaintVolume = normalizeComplaintVolume(complaintCount);

    // anti-hallucination: verify revenue evidence against the cited pages
    const rawEvidence: Evidence[] = c.revenue_evidence.length
      ? c.revenue_evidence
      : [{ claim: c.revenue_claim, url: c.url, source: "llm", reliability: "low" }];
    const verified = await verifyEvidence(rawEvidence);
    const anyVerified = verified.some((e) => e.verified);
    // discount the revenue signal when nothing could be verified
    const revenueSignal = anyVerified ? c.revenue_signal : c.revenue_signal * 0.5;

    const score = opportunityScore({
      revenueSignal,
      payerVolume: c.payer_volume,
      complaintVolume,
      feasibility: c.feasibility,
      competitionThinness: c.competition_thinness,
    });

    // cross-scan memory: same product seen before → carry forward score delta
    const prior = db
      .select()
      .from(opportunities)
      .where(sql`lower(${opportunities.name}) = ${c.name.toLowerCase()}`)
      .orderBy(desc(opportunities.id))
      .limit(1)
      .get();

    db.insert(opportunities)
      .values({
        scanId,
        name: c.name,
        url: c.url,
        category: c.category || query,
        summary: c.summary,
        revenueSignal: round2(revenueSignal),
        payerVolume: round2(c.payer_volume),
        complaintVolume,
        feasibility: round2(c.feasibility),
        competitionThinness: round2(c.competition_thinness),
        opportunityScore: score,
        previousScore: prior?.opportunityScore ?? null,
        timesSeen: (prior?.timesSeen ?? 0) + 1,
        revenueEvidenceJson: JSON.stringify(verified),
        whyWinnable: c.why_winnable,
        status: "candidate",
      })
      .run();
    done++;
  }

  db.update(scoutScans)
    .set({ status: "completed", resultCount: candidates.length })
    .where(eq(scoutScans.id, scanId))
    .run();
  onProgress?.(100, `found ${candidates.length} opportunities`);
  return { count: candidates.length, warnings };
}
