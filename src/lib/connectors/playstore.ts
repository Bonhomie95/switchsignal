import { nameSimilarity, STORE_MATCH_THRESHOLD } from "./match";
import type { ConnectorResult, RawComplaint } from "./types";

/**
 * Google Play reviews via the community google-play-scraper package (free,
 * no key). Loaded dynamically so a breakage in the scraper can never take
 * down the build — it just degrades to a warning like every other connector.
 */
export async function minePlayStore(
  competitorName: string,
  { max = 60, maxRating = 3 }: { max?: number; maxRating?: number } = {},
): Promise<ConnectorResult> {
  const warnings: string[] = [];
  const items: RawComplaint[] = [];
  try {
    const { default: gplay } = (await import("google-play-scraper")) as unknown as {
      default: {
        search: (o: { term: string; num?: number }) => Promise<
          { appId: string; title: string }[]
        >;
        reviews: (o: {
          appId: string;
          sort?: number;
          num?: number;
        }) => Promise<{
          data: {
            id: string;
            userName?: string;
            title?: string | null;
            text?: string | null;
            score?: number;
            date?: string;
            url?: string;
          }[];
        }>;
        sort: { NEWEST: number };
      };
    };

    const results = await gplay.search({ term: competitorName, num: 5 });
    const scored = results
      .map((r) => ({ r, sim: nameSimilarity(competitorName, r.title) }))
      .sort((a, b) => b.sim - a.sim);
    const best = scored[0];
    if (!best || best.sim < STORE_MATCH_THRESHOLD)
      return {
        items,
        warnings: [`playstore: no matching app for "${competitorName}"`],
      };

    const { data } = await gplay.reviews({
      appId: best.r.appId,
      sort: gplay.sort.NEWEST,
      num: max,
    });
    for (const rev of data ?? []) {
      const rating = rev.score ?? NaN;
      if (!Number.isFinite(rating) || rating > maxRating) continue;
      const body = (rev.text ?? "").trim();
      if (body.length < 20) continue;
      items.push({
        source: "playstore",
        externalId: rev.id,
        url:
          rev.url ??
          `https://play.google.com/store/apps/details?id=${best.r.appId}&showAllReviews=true`,
        author: rev.userName ?? "",
        title: `[${rating}★] ${rev.title ?? ""}`.trim(),
        body: body.slice(0, 4000),
        postedAt: rev.date ? Date.parse(rev.date) || null : null,
      });
    }
  } catch (e) {
    warnings.push(`playstore: ${(e as Error).message}`);
  }
  return { items, warnings };
}
