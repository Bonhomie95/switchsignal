import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, opportunities } from "@/db";
import { adoptOpportunity } from "@/lib/jobs/handlers";
import { enqueueJob } from "@/lib/jobs/runner";

const Schema = z.object({
  action: z.enum(["shortlist", "dismiss", "restore", "adopt"]),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  if (!Number.isFinite(id))
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "invalid action" }, { status: 400 });

  switch (parsed.data.action) {
    case "shortlist":
      db.update(opportunities).set({ status: "shortlisted" }).where(eq(opportunities.id, id)).run();
      return NextResponse.json({ ok: true });
    case "dismiss":
      db.update(opportunities).set({ status: "dismissed" }).where(eq(opportunities.id, id)).run();
      return NextResponse.json({ ok: true });
    case "restore":
      db.update(opportunities).set({ status: "candidate" }).where(eq(opportunities.id, id)).run();
      return NextResponse.json({ ok: true });
    case "adopt": {
      // Scout → Compete hand-off: create the product, seed the competitor,
      // and immediately run the full pipeline against it.
      const productId = adoptOpportunity(id);
      const jobId = enqueueJob("full_pipeline", { productId }, productId);
      return NextResponse.json({ ok: true, productId, jobId });
    }
  }
}
