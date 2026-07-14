import { NextResponse } from "next/server";
import { z } from "zod";
import { enqueueJob } from "@/lib/jobs/runner";

const Schema = z.object({
  type: z.enum([
    "full_pipeline",
    "profile_product",
    "discover_competitors",
    "mine_complaints",
    "classify_complaints",
    "reclassify_skipped",
    "generate_leads",
    "refresh_data",
  ]),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  if (!Number.isFinite(id))
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "invalid job type" }, { status: 400 });
  const jobId = enqueueJob(parsed.data.type, { productId: id }, id);
  return NextResponse.json({ jobId });
}
