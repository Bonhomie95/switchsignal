import { and, eq, sql } from "drizzle-orm";
import { competitors, complaints, db, products } from "@/db";

export interface Spike {
  competitorId: number;
  competitorName: string;
  category: string;
  thisWeek: number;
  mean: number;
  z: number;
}

/** Pure z-score of the latest value vs. the preceding series. */
export function zScore(latest: number, history: number[]): number {
  if (history.length < 2) return 0;
  const mean = history.reduce((a, b) => a + b, 0) / history.length;
  const variance =
    history.reduce((a, b) => a + (b - mean) ** 2, 0) / history.length;
  const sd = Math.sqrt(variance);
  if (sd === 0) return latest > mean ? 3 : 0; // flat history, any jump is notable
  return (latest - mean) / sd;
}

const WEEK = 7 * 86_400_000;

/**
 * Detect complaint spikes: for each competitor×category, bucket the last
 * `weeks` weeks and flag when the most recent week is ≥ `threshold` SDs above
 * the preceding weeks. These often follow a bad competitor release — the
 * moment to strike.
 */
export function detectSpikes(
  productId: number,
  { weeks = 8, threshold = 2, minThisWeek = 3 }: { weeks?: number; threshold?: number; minThisWeek?: number } = {},
): Spike[] {
  const since = Date.now() - weeks * WEEK;
  const rows = db
    .select({
      competitorId: complaints.competitorId,
      competitorName: competitors.name,
      category: complaints.category,
      ts: sql<number>`coalesce(${complaints.postedAt}, ${complaints.createdAt})`,
    })
    .from(complaints)
    .leftJoin(competitors, eq(complaints.competitorId, competitors.id))
    .where(
      and(
        eq(complaints.productId, productId),
        eq(complaints.status, "classified"),
        sql`${complaints.category} != 'not_a_complaint'`,
        sql`coalesce(${complaints.postedAt}, ${complaints.createdAt}) >= ${since}`,
      ),
    )
    .all();

  // bucket per competitor+category
  const now = Date.now();
  const series = new Map<string, { name: string; category: string; competitorId: number; weeks: number[] }>();
  for (const r of rows) {
    if (r.competitorId == null) continue;
    const key = `${r.competitorId}:${r.category}`;
    if (!series.has(key))
      series.set(key, {
        name: r.competitorName ?? "unknown",
        category: r.category ?? "other",
        competitorId: r.competitorId,
        weeks: new Array(weeks).fill(0),
      });
    const idx = Math.min(weeks - 1, Math.floor((r.ts - since) / WEEK));
    if (idx >= 0) series.get(key)!.weeks[idx]++;
  }

  const spikes: Spike[] = [];
  for (const s of series.values()) {
    const thisWeek = s.weeks[weeks - 1];
    if (thisWeek < minThisWeek) continue;
    const history = s.weeks.slice(0, weeks - 1);
    const z = zScore(thisWeek, history);
    if (z >= threshold) {
      const mean = history.reduce((a, b) => a + b, 0) / Math.max(history.length, 1);
      spikes.push({
        competitorId: s.competitorId,
        competitorName: s.name,
        category: s.category,
        thisWeek,
        mean: Math.round(mean * 10) / 10,
        z: Math.round(z * 10) / 10,
      });
    }
  }
  return spikes.sort((a, b) => b.z - a.z);
}

/** All spikes across all products, for the Overview alert strip. */
export function allSpikes(): (Spike & { productId: number; productName: string })[] {
  const rows = db.select({ id: products.id, name: products.name }).from(products).all();
  const out: (Spike & { productId: number; productName: string })[] = [];
  for (const p of rows)
    for (const s of detectSpikes(p.id))
      out.push({ ...s, productId: p.id, productName: p.name });
  return out.sort((a, b) => b.z - a.z).slice(0, 5);
}
