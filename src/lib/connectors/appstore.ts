import { politeFetch } from "./http";
import { nameSimilarity, STORE_MATCH_THRESHOLD } from "./match";
import type { ConnectorResult, RawComplaint } from "./types";

/**
 * Apple App Store: free public endpoints, no key.
 *  - app lookup: itunes.apple.com/search
 *  - reviews:    itunes.apple.com/{cc}/rss/customerreviews (most recent, paged)
 * Low-star reviews are the complaint signal.
 */
export async function findAppStoreApp(
  name: string,
): Promise<{ id: number; trackName: string } | null> {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(name)}&entity=software&limit=5`;
  const res = await politeFetch(url);
  if (!res.ok) return null;
  const data = (await res.json()) as {
    results?: { trackId: number; trackName: string }[];
  };
  const results = data.results ?? [];
  if (!results.length) return null;
  // require a real name match — pulling reviews of an unrelated app poisons
  // complaint counts (this happened with placeholder names in testing)
  const scored = results
    .map((r) => ({ r, sim: nameSimilarity(name, r.trackName) }))
    .sort((a, b) => b.sim - a.sim);
  const best = scored[0];
  if (!best || best.sim < STORE_MATCH_THRESHOLD) return null;
  return { id: best.r.trackId, trackName: best.r.trackName };
}

interface RSSEntry {
  id?: { label?: string };
  author?: { name?: { label?: string } };
  title?: { label?: string };
  content?: { label?: string };
  "im:rating"?: { label?: string };
  updated?: { label?: string };
}

export async function mineAppStore(
  competitorName: string,
  {
    country = "us",
    pages = 2,
    maxRating = 3,
  }: { country?: string; pages?: number; maxRating?: number } = {},
): Promise<ConnectorResult> {
  const warnings: string[] = [];
  const items: RawComplaint[] = [];
  let app;
  try {
    app = await findAppStoreApp(competitorName);
  } catch (e) {
    return { items, warnings: [`appstore lookup: ${(e as Error).message}`] };
  }
  if (!app) return { items, warnings: [`appstore: no app found for "${competitorName}"`] };

  for (let page = 1; page <= pages; page++) {
    try {
      const url = `https://itunes.apple.com/${country}/rss/customerreviews/page=${page}/id=${app.id}/sortby=mostrecent/json`;
      const res = await politeFetch(url);
      if (!res.ok) {
        warnings.push(`appstore reviews p${page}: ${res.status}`);
        break;
      }
      const data = (await res.json()) as { feed?: { entry?: RSSEntry[] | RSSEntry } };
      const entries = Array.isArray(data.feed?.entry)
        ? data.feed.entry
        : data.feed?.entry
          ? [data.feed.entry]
          : [];
      for (const e of entries) {
        const rating = Number(e["im:rating"]?.label ?? NaN);
        if (!Number.isFinite(rating)) continue; // first entry is app metadata
        if (rating > maxRating) continue;
        const body = e.content?.label?.trim() ?? "";
        if (body.length < 20) continue;
        items.push({
          source: "appstore",
          externalId: e.id?.label ?? `${app.id}-${page}-${items.length}`,
          url: `https://apps.apple.com/${country}/app/id${app.id}?see-all=reviews`,
          author: e.author?.name?.label ?? "",
          title: `[${rating}★] ${e.title?.label ?? ""}`,
          body: body.slice(0, 4000),
          postedAt: e.updated?.label ? Date.parse(e.updated.label) || null : null,
        });
      }
    } catch (e) {
      warnings.push(`appstore reviews p${page}: ${(e as Error).message}`);
    }
  }
  return { items, warnings };
}
