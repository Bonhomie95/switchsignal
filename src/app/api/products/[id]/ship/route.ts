import { NextResponse } from "next/server";
import { z } from "zod";
import { shipFeature, unshipFeature } from "@/lib/analysis/ship";

const Schema = z.object({
  feature: z.string().min(1).max(120),
  action: z.enum(["ship", "unship"]).default("ship"),
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
    return NextResponse.json({ error: "invalid request" }, { status: 400 });

  if (parsed.data.action === "unship") {
    unshipFeature(id, parsed.data.feature);
    return NextResponse.json({ ok: true, resurfaced: 0 });
  }
  try {
    const { resurfaced } = await shipFeature(id, parsed.data.feature);
    return NextResponse.json({ ok: true, resurfaced });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
