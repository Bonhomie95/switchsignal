import { NextResponse } from "next/server";
import { z } from "zod";
import { db, products } from "@/db";
import { enqueueJob } from "@/lib/jobs/runner";

const CreateSchema = z.object({
  name: z.string().min(1).max(120),
  inputType: z.enum(["markdown", "url", "repo", "store", "form"]),
  rawInput: z.string().min(4).max(50_000),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid input" }, { status: 400 });
  const res = db
    .insert(products)
    .values({ ...parsed.data, status: "profiling" })
    .run();
  const productId = Number(res.lastInsertRowid);
  const jobId = enqueueJob("full_pipeline", { productId }, productId);
  return NextResponse.json({ productId, jobId });
}
