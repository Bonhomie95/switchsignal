import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db, jobs } from "@/db";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const productId = url.searchParams.get("productId");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 20), 100);
  const rows = productId
    ? db
        .select()
        .from(jobs)
        .where(eq(jobs.productId, Number(productId)))
        .orderBy(desc(jobs.id))
        .limit(limit)
        .all()
    : db.select().from(jobs).orderBy(desc(jobs.id)).limit(limit).all();
  return NextResponse.json({ jobs: rows });
}
