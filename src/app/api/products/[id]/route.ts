import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, products } from "@/db";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  if (!Number.isFinite(id))
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  db.delete(products).where(eq(products.id, id)).run();
  return NextResponse.json({ ok: true });
}
