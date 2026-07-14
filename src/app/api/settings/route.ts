import { NextResponse } from "next/server";
import { z } from "zod";
import { getSetting, setSetting } from "@/lib/llm";

const ALLOWED_KEYS = [
  "llm_provider",
  "reddit_client_id",
  "reddit_client_secret",
  "auto_refresh_hours",
  "daily_token_budget",
  "reddit_username",
  "hn_username",
] as const;

export async function GET() {
  const out: Record<string, string | null> = {};
  for (const k of ALLOWED_KEYS) {
    const v = getSetting(k);
    // don't ship the reddit secret back to the client
    out[k] = k === "reddit_client_secret" ? (v ? "••••••" : null) : v;
  }
  return NextResponse.json(out);
}

const Schema = z.object({
  key: z.enum(ALLOWED_KEYS),
  value: z.string().max(300),
});

export async function POST(req: Request) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "invalid setting" }, { status: 400 });
  setSetting(parsed.data.key, parsed.data.value);
  return NextResponse.json({ ok: true });
}
