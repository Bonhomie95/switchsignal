import { sql } from "drizzle-orm";
import { db } from "@/db";

/** Build a safe FTS5 prefix query from raw user input. */
export function ftsQuery(input: string): string {
  const tokens = input
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1)
    .slice(0, 8);
  return tokens.map((t) => `"${t}"*`).join(" ");
}

/** Full-text search over complaints; returns matching complaint ids by rank. */
export function searchComplaintIds(query: string, limit = 500): number[] {
  const q = ftsQuery(query);
  if (!q) return [];
  try {
    const rows = db.all<{ rowid: number }>(
      sql`SELECT rowid FROM complaints_fts WHERE complaints_fts MATCH ${q} ORDER BY rank LIMIT ${limit}`,
    );
    return rows.map((r) => Number(r.rowid));
  } catch {
    return []; // malformed query → no results, never a crash
  }
}
