import { and, eq } from "drizzle-orm";
import { connectorState, db } from "@/db";

/**
 * Per (competitor, source) crawl state: an incremental cursor so re-crawls
 * only process newer items, plus a circuit breaker that backs a source off
 * after repeated failures instead of hammering it every run.
 */

const MAX_FAILURES = 4;
const BACKOFF_MS = 6 * 3600_000; // 6h after tripping

export function getConnectorState(competitorId: number, source: string) {
  return db
    .select()
    .from(connectorState)
    .where(
      and(eq(connectorState.competitorId, competitorId), eq(connectorState.source, source)),
    )
    .get();
}

/** True when the circuit breaker is currently open (skip this source). */
export function isTripped(competitorId: number, source: string, now = Date.now()): boolean {
  const s = getConnectorState(competitorId, source);
  return !!s && s.disabledUntil > now;
}

/** Cursor timestamp (ms); items at/before this were already seen. */
export function cursorFor(competitorId: number, source: string): number {
  return getConnectorState(competitorId, source)?.cursorTs ?? 0;
}

function upsert(competitorId: number, source: string, patch: Record<string, unknown>) {
  const existing = getConnectorState(competitorId, source);
  if (existing) {
    db.update(connectorState)
      .set(patch)
      .where(eq(connectorState.id, existing.id))
      .run();
  } else {
    db.insert(connectorState)
      .values({ competitorId, source, ...patch })
      .run();
  }
}

export function recordSuccess(
  competitorId: number,
  source: string,
  itemCount: number,
  newestTs: number,
) {
  const prev = cursorFor(competitorId, source);
  upsert(competitorId, source, {
    cursorTs: Math.max(prev, newestTs),
    consecutiveFailures: 0,
    disabledUntil: 0,
    lastRunAt: Date.now(),
    lastItemCount: itemCount,
    lastError: "",
  });
}

export function recordFailure(competitorId: number, source: string, error: string) {
  const existing = getConnectorState(competitorId, source);
  const failures = (existing?.consecutiveFailures ?? 0) + 1;
  upsert(competitorId, source, {
    consecutiveFailures: failures,
    disabledUntil: failures >= MAX_FAILURES ? Date.now() + BACKOFF_MS : 0,
    lastRunAt: Date.now(),
    lastError: error.slice(0, 200),
  });
}

export interface HealthRow {
  competitorId: number;
  competitorName: string;
  source: string;
  lastRunAt: number;
  lastItemCount: number;
  consecutiveFailures: number;
  disabledUntil: number;
  lastError: string;
}
