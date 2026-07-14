import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { competitors, complaints, db, leads, products } from "@/db";
import { draftReply, ProductProfileSchema } from "@/lib/analysis";

/** Regenerate the draft for one lead. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  const lead = db.select().from(leads).where(eq(leads.id, id)).get();
  if (!lead) return NextResponse.json({ error: "lead not found" }, { status: 404 });
  const complaint = db
    .select()
    .from(complaints)
    .where(eq(complaints.id, lead.complaintId))
    .get();
  const product = db
    .select()
    .from(products)
    .where(eq(products.id, lead.productId))
    .get();
  if (!complaint || !product?.profileJson)
    return NextResponse.json({ error: "missing complaint or profile" }, { status: 400 });
  const competitor = complaint.competitorId
    ? db.select().from(competitors).where(eq(competitors.id, complaint.competitorId)).get()
    : null;
  try {
    const profile = ProductProfileSchema.parse(JSON.parse(product.profileJson));
    const draft = await draftReply(profile, competitor?.name ?? "the competitor", complaint);
    db.update(leads)
      .set({ draft, status: lead.status === "new" ? "drafted" : lead.status, updatedAt: Date.now() })
      .where(eq(leads.id, id))
      .run();
    return NextResponse.json({ draft });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
