import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { competitors, connectorState, db } from "@/db";

export async function GET() {
  const rows = db
    .select({
      competitorName: competitors.name,
      source: connectorState.source,
      lastRunAt: connectorState.lastRunAt,
      lastItemCount: connectorState.lastItemCount,
      consecutiveFailures: connectorState.consecutiveFailures,
      disabledUntil: connectorState.disabledUntil,
      lastError: connectorState.lastError,
    })
    .from(connectorState)
    .leftJoin(competitors, eq(connectorState.competitorId, competitors.id))
    .orderBy(desc(connectorState.lastRunAt))
    .limit(60)
    .all();
  return NextResponse.json({ connectors: rows, now: Date.now() });
}
