import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiKeys, db } from "@/db";
import { groqPoolStats, refreshGroqPool } from "@/lib/llm";

function masked(key: string): string {
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export async function GET() {
  const rows = db.select().from(apiKeys).orderBy(desc(apiKeys.id)).all();
  const pool = groqPoolStats();
  return NextResponse.json({
    keys: rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      label: r.label,
      masked: masked(r.key),
      active: r.active,
      requestCount: r.requestCount,
      lastUsedAt: r.lastUsedAt,
      pool: pool.find((p) => p.id === r.id) ?? null,
    })),
  });
}

const AddSchema = z.object({
  provider: z.enum(["groq", "anthropic", "brave"]),
  key: z.string().min(8).max(300),
  label: z.string().max(60).default(""),
});

export async function POST(req: Request) {
  const parsed = AddSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "invalid key" }, { status: 400 });
  db.insert(apiKeys).values({ ...parsed.data, active: true }).run();
  refreshGroqPool();
  return NextResponse.json({ ok: true });
}

const DeleteSchema = z.object({ id: z.number() });

export async function DELETE(req: Request) {
  const parsed = DeleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  db.delete(apiKeys).where(eq(apiKeys.id, parsed.data.id)).run();
  refreshGroqPool();
  return NextResponse.json({ ok: true });
}
