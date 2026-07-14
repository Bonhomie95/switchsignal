import { politeFetch } from "./http";
import { mentionsProduct } from "./match";
import type { ConnectorResult, RawComplaint } from "./types";

interface HNHit {
  objectID: string;
  author?: string;
  comment_text?: string;
  story_text?: string;
  title?: string;
  story_title?: string;
  story_id?: number;
  created_at_i?: number;
}

/** Hacker News via the free Algolia API (no key required). */
export async function mineHN(
  competitorName: string,
  { maxHits = 50 }: { maxHits?: number } = {},
): Promise<ConnectorResult> {
  const items: RawComplaint[] = [];
  const warnings: string[] = [];
  for (const tags of ["comment", "story"]) {
    try {
      const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(
        `"${competitorName}"`,
      )}&tags=${tags}&hitsPerPage=${maxHits}`;
      const res = await politeFetch(url);
      if (!res.ok) {
        warnings.push(`hn: ${res.status} for tags=${tags}`);
        continue;
      }
      const data = (await res.json()) as { hits?: HNHit[] };
      for (const hit of data.hits ?? []) {
        const body = stripHtml(hit.comment_text ?? hit.story_text ?? "").trim();
        const title = hit.title ?? hit.story_title ?? "";
        if ((body || title).length < 30) continue;
        // cheap pre-filter: must mention the competitor as a whole word/phrase
        if (!mentionsProduct(`${title} ${body}`, competitorName)) continue;
        items.push({
          source: "hn",
          externalId: hit.objectID,
          url: `https://news.ycombinator.com/item?id=${hit.story_id ?? hit.objectID}`,
          author: hit.author ?? "",
          title,
          body: (body || title).slice(0, 4000),
          postedAt: hit.created_at_i ? hit.created_at_i * 1000 : null,
        });
      }
    } catch (e) {
      warnings.push(`hn: ${(e as Error).message}`);
    }
  }
  return { items, warnings };
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/\s+/g, " ");
}
