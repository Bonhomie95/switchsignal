/** Pure text-matching helpers shared by connectors. */

/**
 * True when `text` mentions `name` as a whole word/phrase — so searching for
 * "Notion" no longer matches the common noun "notion" mid-sentence is
 * impossible to distinguish, but it DOES stop matches inside other words
 * ("prenotion", "notional") and requires every token of multi-word names.
 */
export function mentionsProduct(text: string, name: string): boolean {
  const escaped = name
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  if (!escaped) return false;
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escaped}(?:[^\\p{L}\\p{N}]|$)`, "iu").test(
    text,
  );
}

/**
 * Similarity between a query name and a store listing title, 0–1.
 * Token-based: how many of the query's tokens appear in the candidate
 * (order-insensitive), weighted by a containment bonus. "Notion" vs
 * "Notion: notes, docs, tasks" → high; "Competitor 1 (mock)" vs
 * "Solitaire Card Game" → ~0.
 */
export function nameSimilarity(query: string, candidate: string): number {
  const qTokens = tokenize(query);
  const cTokens = new Set(tokenize(candidate));
  if (!qTokens.length || !cTokens.size) return 0;
  const hit = qTokens.filter((t) => cTokens.has(t)).length;
  const tokenScore = hit / qTokens.length;
  const contains = candidate.toLowerCase().includes(query.trim().toLowerCase());
  return Math.min(1, tokenScore * 0.8 + (contains ? 0.2 : 0));
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((t) => t.length > 1);
}

/** Threshold below which a store search result is considered a wrong match. */
export const STORE_MATCH_THRESHOLD = 0.6;
