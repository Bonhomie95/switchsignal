import { and, eq, gte, sql } from "drizzle-orm";
import { complaints, db, featureClusters, shippedFeatures } from "@/db";

export interface FeatureReportRow {
  feature: string;
  category: string;
  count: number;
  avgPayer: number;
  avgIntent: number;
  avgSeverity: number;
  score: number;
  sampleIds: number[];
  shipped: boolean;
}

/**
 * Gap Report (fit < threshold): complaints we do NOT solve → build-next list.
 * Ammo Report (fit >= threshold): complaints we DO solve → marketing angles.
 * Ranked by frequency × payer likelihood × switch intent (severity as tiebreaker).
 */
export function featureReport(
  productId: number,
  kind: "gap" | "ammo",
  { fitThreshold = 0.5, limit = 30 }: { fitThreshold?: number; limit?: number } = {},
): FeatureReportRow[] {
  // group by canonical cluster label when clustering has run, so "team sso"
  // and "sso / team management" count as one feature; fall back to raw strings
  const featureExpr = sql<string>`coalesce(${featureClusters.label}, ${complaints.feature}, ${complaints.category})`;
  const shipped = new Set(
    db
      .select({ feature: shippedFeatures.feature })
      .from(shippedFeatures)
      .where(eq(shippedFeatures.productId, productId))
      .all()
      .map((r) => r.feature.toLowerCase()),
  );
  const rows = db
    .select({
      feature: featureExpr,
      category: sql<string>`${complaints.category}`,
      count: sql<number>`count(*)`,
      avgPayer: sql<number>`avg(coalesce(${complaints.payerScore}, 0))`,
      avgIntent: sql<number>`avg(coalesce(${complaints.intentScore}, 0))`,
      avgSeverity: sql<number>`avg(coalesce(${complaints.severity}, 0))`,
      sampleIds: sql<string>`group_concat(${complaints.id})`,
    })
    .from(complaints)
    .leftJoin(featureClusters, eq(complaints.clusterId, featureClusters.id))
    .where(
      and(
        eq(complaints.productId, productId),
        eq(complaints.status, "classified"),
        sql`${complaints.category} != 'not_a_complaint'`,
        kind === "gap"
          ? sql`coalesce(${complaints.fitScore}, 0) < ${fitThreshold}`
          : gte(complaints.fitScore, fitThreshold),
      ),
    )
    .groupBy(featureExpr, complaints.category)
    .all();

  return rows
    .map((r) => ({
      feature: r.feature ?? "unspecified",
      category: r.category ?? "other",
      shipped: shipped.has((r.feature ?? "").toLowerCase()),
      count: Number(r.count),
      avgPayer: round2(Number(r.avgPayer)),
      avgIntent: round2(Number(r.avgIntent)),
      avgSeverity: round2(Number(r.avgSeverity)),
      score: round2(
        Number(r.count) *
          (0.3 + Number(r.avgPayer)) *
          (0.3 + Number(r.avgIntent)) *
          (0.7 + 0.3 * Number(r.avgSeverity)),
      ),
      sampleIds: String(r.sampleIds ?? "")
        .split(",")
        .filter(Boolean)
        .map(Number)
        .slice(0, 5),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
