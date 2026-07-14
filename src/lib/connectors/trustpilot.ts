import { politeFetch } from "./http";
import type { ConnectorResult, RawComplaint } from "./types";

/**
 * Trustpilot reviews. Their review pages embed the full review payload in the
 * __NEXT_DATA__ JSON blob, which is far more stable than scraping markup.
 * We only take 1–3★ reviews. Needs the competitor's domain (from its URL).
 */
export async function mineTrustpilot(
  competitorUrl: string,
  { maxRating = 3 }: { maxRating?: number } = {},
): Promise<ConnectorResult> {
  const items: RawComplaint[] = [];
  const warnings: string[] = [];
  const domain = extractDomain(competitorUrl);
  if (!domain) return { items, warnings };

  try {
    const res = await politeFetch(`https://www.trustpilot.com/review/${domain}`, {
      headers: { Accept: "text/html" },
    });
    if (res.status === 404)
      return { items, warnings: [`trustpilot: no page for ${domain}`] };
    if (!res.ok)
      return { items, warnings: [`trustpilot: ${res.status} for ${domain}`] };
    const html = await res.text();
    const m = html.match(
      /<script id="__NEXT_DATA__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/,
    );
    if (!m)
      return { items, warnings: [`trustpilot: page format changed for ${domain}`] };

    const data = JSON.parse(m[1]) as {
      props?: {
        pageProps?: {
          reviews?: {
            id: string;
            title?: string;
            text?: string;
            rating?: number;
            consumer?: { displayName?: string };
            dates?: { publishedDate?: string };
          }[];
        };
      };
    };
    for (const rev of data.props?.pageProps?.reviews ?? []) {
      const rating = rev.rating ?? NaN;
      if (!Number.isFinite(rating) || rating > maxRating) continue;
      const body = (rev.text ?? "").trim();
      if (body.length < 20) continue;
      items.push({
        source: "trustpilot",
        externalId: rev.id,
        url: `https://www.trustpilot.com/reviews/${rev.id}`,
        author: rev.consumer?.displayName ?? "",
        title: `[${rating}★] ${rev.title ?? ""}`.trim(),
        body: body.slice(0, 4000),
        postedAt: rev.dates?.publishedDate
          ? Date.parse(rev.dates.publishedDate) || null
          : null,
      });
    }
  } catch (e) {
    warnings.push(`trustpilot: ${(e as Error).message}`);
  }
  return { items, warnings };
}

export function extractDomain(url: string): string | null {
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
    const clean = host.replace(/^www\./, "");
    // skip marketplace/store URLs — trustpilot pages are keyed by product domain
    if (/apple\.com|google\.com|github\.com|example\.com/.test(clean)) return null;
    return clean;
  } catch {
    return null;
  }
}
