import { gte, sql } from "drizzle-orm";
import { db, llmUsage } from "@/db";

export interface UsageEvent {
  provider: string;
  model: string;
  tag: string;
  keyId: string;
  promptTokens: number;
  completionTokens: number;
}

/** Fire-and-forget usage recording — must never break a completion. */
export function recordUsage(u: UsageEvent) {
  try {
    db.insert(llmUsage)
      .values({
        provider: u.provider,
        model: u.model,
        tag: u.tag,
        keyId: String(u.keyId),
        promptTokens: u.promptTokens,
        completionTokens: u.completionTokens,
        totalTokens: u.promptTokens + u.completionTokens,
      })
      .run();
  } catch {
    /* usage accounting is best-effort */
  }
}

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function tokensUsedToday(): number {
  return (
    db
      .select({ n: sql<number>`coalesce(sum(${llmUsage.totalTokens}), 0)` })
      .from(llmUsage)
      .where(gte(llmUsage.createdAt, startOfToday()))
      .get()?.n ?? 0
  );
}

export interface UsageStats {
  today: { tokens: number; requests: number };
  week: { tokens: number; requests: number };
  byTag: { tag: string; tokens: number; requests: number }[];
  byDay: { day: string; tokens: number }[];
}

export function usageStats(): UsageStats {
  const weekAgo = Date.now() - 7 * 86_400_000;
  const today = db
    .select({
      tokens: sql<number>`coalesce(sum(${llmUsage.totalTokens}), 0)`,
      requests: sql<number>`count(*)`,
    })
    .from(llmUsage)
    .where(gte(llmUsage.createdAt, startOfToday()))
    .get();
  const week = db
    .select({
      tokens: sql<number>`coalesce(sum(${llmUsage.totalTokens}), 0)`,
      requests: sql<number>`count(*)`,
    })
    .from(llmUsage)
    .where(gte(llmUsage.createdAt, weekAgo))
    .get();
  const byTag = db
    .select({
      tag: llmUsage.tag,
      tokens: sql<number>`coalesce(sum(${llmUsage.totalTokens}), 0)`,
      requests: sql<number>`count(*)`,
    })
    .from(llmUsage)
    .where(gte(llmUsage.createdAt, weekAgo))
    .groupBy(llmUsage.tag)
    .orderBy(sql`sum(${llmUsage.totalTokens}) desc`)
    .all();
  const byDay = db
    .select({
      day: sql<string>`date(${llmUsage.createdAt} / 1000, 'unixepoch')`,
      tokens: sql<number>`coalesce(sum(${llmUsage.totalTokens}), 0)`,
    })
    .from(llmUsage)
    .where(gte(llmUsage.createdAt, weekAgo))
    .groupBy(sql`date(${llmUsage.createdAt} / 1000, 'unixepoch')`)
    .all();
  return {
    today: { tokens: Number(today?.tokens ?? 0), requests: Number(today?.requests ?? 0) },
    week: { tokens: Number(week?.tokens ?? 0), requests: Number(week?.requests ?? 0) },
    byTag: byTag.map((r) => ({
      tag: r.tag,
      tokens: Number(r.tokens),
      requests: Number(r.requests),
    })),
    byDay: byDay.map((r) => ({ day: r.day, tokens: Number(r.tokens) })),
  };
}

/* ---------------- budget ---------------- */

export const DEFAULT_DAILY_TOKEN_BUDGET = 500_000;

/** Rough per-call token costs used for planning batch sizes. */
export const EST_TOKENS = {
  triage: 350,
  classify: 900,
  draft: 900,
  profile: 3500,
  discover: 2500,
  scout: 3500,
} as const;

/**
 * How many calls of `kind` fit in what's left of today's budget.
 * A budget of 0 means unlimited.
 */
export function budgetRemainingCalls(
  kind: keyof typeof EST_TOKENS,
  dailyBudget: number,
  usedToday: number = tokensUsedToday(),
): number {
  if (dailyBudget <= 0) return Number.MAX_SAFE_INTEGER;
  const remainingTokens = dailyBudget - usedToday;
  return Math.max(0, Math.floor(remainingTokens / EST_TOKENS[kind]));
}
