import { createHash } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { type Competitor, db, pricingSnapshots } from "@/db";
import { fetchPageText } from "@/lib/connectors";
import { completeJSON } from "@/lib/llm";

export const PricingPlansSchema = z.object({
  plans: z.array(
    z.object({
      plan: z.string().min(1),
      price: z.string().min(1), // "$12", "free", "custom"
      period: z.string().default(""), // "/mo", "/yr", "one-time"
    }),
  ),
});
export type PricingPlans = z.infer<typeof PricingPlansSchema>;

const SYSTEM = `You extract pricing plans from a product page. Respond with ONLY JSON:
{"plans": [{"plan": string (tier name), "price": string (e.g. "$12", "free", "custom"), "period": string (e.g. "/mo per user", "/yr", "")}]}
Only include plans actually stated on the page. If no pricing is visible, return {"plans": []}.`;

function stableHash(plans: PricingPlans["plans"]): string {
  const canonical = plans
    .map((p) => `${p.plan.toLowerCase()}|${p.price.toLowerCase()}|${p.period.toLowerCase()}`)
    .sort()
    .join("\n");
  return createHash("sha256").update(canonical).digest("hex").slice(0, 16);
}

/** Human-readable diff between two snapshots' plan lists. */
export function diffPlans(
  prev: PricingPlans["plans"],
  next: PricingPlans["plans"],
): string {
  const changes: string[] = [];
  const prevByName = new Map(prev.map((p) => [p.plan.toLowerCase(), p]));
  const nextByName = new Map(next.map((p) => [p.plan.toLowerCase(), p]));
  for (const [name, p] of nextByName) {
    const old = prevByName.get(name);
    if (!old) changes.push(`new plan "${p.plan}" at ${p.price}${p.period}`);
    else if (old.price !== p.price || old.period !== p.period)
      changes.push(`"${p.plan}": ${old.price}${old.period} → ${p.price}${p.period}`);
  }
  for (const [name, p] of prevByName)
    if (!nextByName.has(name)) changes.push(`plan "${p.plan}" removed`);
  return changes.join("; ");
}

/**
 * Snapshot one competitor's public pricing; records a new row only when the
 * extracted plans changed. Returns a change summary ("" = no change).
 */
export async function trackCompetitorPricing(
  competitor: Pick<Competitor, "id" | "name" | "url">,
): Promise<{ changed: boolean; summary: string } | null> {
  if (!competitor.url || /example\.com/.test(competitor.url)) return null;

  // pricing page first, homepage as fallback
  let text: string | null = null;
  for (const candidate of [joinUrl(competitor.url, "/pricing"), competitor.url]) {
    try {
      text = await fetchPageText(candidate, 10_000);
      if (text && text.length > 200) break;
    } catch {
      text = null;
    }
  }
  if (!text) return null;

  const { plans } = await completeJSON(
    {
      tag: "profile",
      system: SYSTEM,
      prompt: `Product: ${competitor.name}\n\nPage text:\n${text}`,
      temperature: 0,
      maxTokens: 600,
    },
    PricingPlansSchema,
  );
  if (!plans.length) return null;

  const hash = stableHash(plans);
  const last = db
    .select()
    .from(pricingSnapshots)
    .where(eq(pricingSnapshots.competitorId, competitor.id))
    .orderBy(desc(pricingSnapshots.id))
    .limit(1)
    .get();
  if (last && last.pricingHash === hash) return { changed: false, summary: "" };

  const prevPlans: PricingPlans["plans"] = last
    ? (JSON.parse(last.pricingJson) as PricingPlans["plans"])
    : [];
  const summary = last ? diffPlans(prevPlans, plans) : "";
  db.insert(pricingSnapshots)
    .values({
      competitorId: competitor.id,
      pricingJson: JSON.stringify(plans),
      pricingHash: hash,
      changeSummary: summary,
    })
    .run();
  return { changed: !!last, summary };
}

function joinUrl(base: string, path: string): string {
  try {
    return new URL(path, base.startsWith("http") ? base : `https://${base}`).toString();
  } catch {
    return base;
  }
}
