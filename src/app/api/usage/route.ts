import { NextResponse } from "next/server";
import { getSetting, usageStats, DEFAULT_DAILY_TOKEN_BUDGET } from "@/lib/llm";

export async function GET() {
  const stats = usageStats();
  const budget = Number(
    getSetting("daily_token_budget") ?? DEFAULT_DAILY_TOKEN_BUDGET,
  );
  return NextResponse.json({ ...stats, budget });
}
