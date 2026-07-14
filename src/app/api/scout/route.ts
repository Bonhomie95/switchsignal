import { NextResponse } from "next/server";
import { z } from "zod";
import { db, scoutScans } from "@/db";
import { enqueueJob } from "@/lib/jobs/runner";

const Schema = z.object({ query: z.string().min(2).max(200) });

export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "enter a category or keyword" }, { status: 400 });
  const res = db
    .insert(scoutScans)
    .values({ query: parsed.data.query, status: "queued" })
    .run();
  const scanId = Number(res.lastInsertRowid);
  const jobId = enqueueJob("scout_scan", { scanId, query: parsed.data.query });
  return NextResponse.json({ scanId, jobId });
}
