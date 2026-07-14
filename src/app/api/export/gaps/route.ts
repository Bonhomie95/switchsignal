import { NextResponse } from "next/server";
import { csvResponse, toCsv } from "@/lib/csv";
import { featureReport } from "@/lib/analysis/reports";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const productId = Number(url.searchParams.get("productId"));
  if (!Number.isFinite(productId) || productId <= 0)
    return NextResponse.json({ error: "productId required" }, { status: 400 });
  const kind = url.searchParams.get("kind") === "ammo" ? "ammo" : "gap";

  const rows = featureReport(productId, kind, { limit: 200 });
  if (!rows.length)
    return NextResponse.json({ error: "nothing to export yet" }, { status: 404 });

  const csv = toCsv(
    ["rank", "feature", "category", "count", "avg_payer", "avg_intent", "avg_severity", "raw_score"],
    rows.map((r, i) => [
      i + 1, r.feature, r.category, r.count, r.avgPayer, r.avgIntent, r.avgSeverity, r.score,
    ]),
  );
  return csvResponse(`switchsignal-${kind}-report-p${productId}.csv`, csv);
}
