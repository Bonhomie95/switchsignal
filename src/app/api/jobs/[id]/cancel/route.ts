import { NextResponse } from "next/server";
import { cancelJob } from "@/lib/jobs/runner";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const id = Number((await params).id);
  if (!Number.isFinite(id))
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  const ok = cancelJob(id);
  return NextResponse.json({ ok });
}
