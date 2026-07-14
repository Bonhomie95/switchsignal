import { and, eq } from "drizzle-orm";
import { apiKeys, db } from "@/db";
import { politeFetch } from "./http";
import type { SearchResult } from "./types";

function braveKey(): string | null {
  const row = db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.provider, "brave"), eq(apiKeys.active, true)))
    .get();
  return row?.key ?? process.env.BRAVE_API_KEY ?? null;
}

/**
 * Web search. Brave free tier (~2k queries/mo) when a key exists; otherwise
 * returns [] and callers fall back to LLM knowledge + manual entry.
 */
export async function webSearch(
  query: string,
  { count = 10 }: { count?: number } = {},
): Promise<SearchResult[]> {
  const key = braveKey();
  if (!key) return [];
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
    const res = await politeFetch(url, {
      headers: { "X-Subscription-Token": key, Accept: "application/json" },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as {
      web?: { results?: { title: string; url: string; description?: string }[] };
    };
    return (data.web?.results ?? []).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.description ?? "",
    }));
  } catch {
    return [];
  }
}

export function hasSearchKey(): boolean {
  return braveKey() !== null;
}
