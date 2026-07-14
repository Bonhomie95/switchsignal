import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { competitors, complaints, db, leads, products } from "@/db";
import { csvResponse, toCsv } from "@/lib/csv";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const productId = url.searchParams.get("productId");

  let rows = db
    .select({
      lead: leads,
      complaint: complaints,
      competitorName: competitors.name,
      productName: products.name,
    })
    .from(leads)
    .innerJoin(complaints, eq(leads.complaintId, complaints.id))
    .innerJoin(products, eq(leads.productId, products.id))
    .leftJoin(competitors, eq(complaints.competitorId, competitors.id))
    .orderBy(desc(leads.score))
    .all();
  if (productId) rows = rows.filter((r) => r.lead.productId === Number(productId));

  const csv = toCsv(
    [
      "lead_id", "product", "competitor", "status", "score", "channel",
      "source", "source_url", "author", "category", "feature",
      "payer_score", "intent_score", "fit_score",
      "complaint_title", "complaint_body", "message", "posted_at", "created_at",
    ],
    rows.map((r) => [
      r.lead.id,
      r.productName,
      r.competitorName ?? "",
      r.lead.status,
      r.lead.score,
      r.lead.channel,
      r.complaint.source,
      r.complaint.sourceUrl,
      r.complaint.author,
      r.complaint.category ?? "",
      r.complaint.feature ?? "",
      r.complaint.payerScore ?? "",
      r.complaint.intentScore ?? "",
      r.complaint.fitScore ?? "",
      r.complaint.title,
      r.complaint.body.slice(0, 1000),
      r.lead.finalMessage || r.lead.draft,
      r.complaint.postedAt ? new Date(r.complaint.postedAt).toISOString() : "",
      new Date(r.lead.createdAt).toISOString(),
    ]),
  );
  if (!rows.length) return NextResponse.json({ error: "no leads to export" }, { status: 404 });
  return csvResponse(`switchsignal-leads${productId ? `-p${productId}` : ""}.csv`, csv);
}
