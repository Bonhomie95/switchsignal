import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, leads } from "@/db";

const Schema = z.object({
  status: z
    .enum(["new", "drafted", "approved", "rejected", "sent", "replied", "trial", "converted"])
    .optional(),
  finalMessage: z.string().max(5000).optional(),
  notes: z.string().max(2000).optional(),
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
    return NextResponse.json({ error: "invalid update" }, { status: 400 });
  const update: Record<string, unknown> = { updatedAt: Date.now() };
  if (parsed.data.status) {
    update.status = parsed.data.status;
    if (parsed.data.status === "sent") update.sentAt = Date.now();
  }
  if (parsed.data.finalMessage !== undefined) update.finalMessage = parsed.data.finalMessage;
  if (parsed.data.notes !== undefined) update.notes = parsed.data.notes;
  db.update(leads).set(update).where(eq(leads.id, id)).run();
  return NextResponse.json({ ok: true });
}
