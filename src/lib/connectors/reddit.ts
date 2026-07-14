import { eq } from "drizzle-orm";
import { db, settings } from "@/db";
import { politeFetch, sleep } from "./http";
import type { ConnectorResult, RawComplaint } from "./types";

/**
 * Reddit connector.
 *
 * Reddit blocks unauthenticated JSON access from most non-browser clients, so
 * the reliable path is the official (free) OAuth API: the user creates a
 * "script" app at reddit.com/prefs/apps and pastes the client id/secret in
 * Settings. Without credentials we still try the public endpoint once, then
 * degrade to a warning instead of failing the run.
 */

interface RedditPost {
  kind: string;
  data: {
    id: string;
    title?: string;
    selftext?: string;
    body?: string;
    author?: string;
    permalink?: string;
    created_utc?: number;
    subreddit?: string;
  };
}

function getSetting(key: string): string | null {
  return (
    db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null
  );
}

function redditCreds(): { id: string; secret: string } | null {
  const id = getSetting("reddit_client_id") ?? process.env.REDDIT_CLIENT_ID;
  const secret =
    getSetting("reddit_client_secret") ?? process.env.REDDIT_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getRedditToken(): Promise<string | null> {
  return getAccessToken();
}

async function getAccessToken(): Promise<string | null> {
  const creds = redditCreds();
  if (!creds) return null;
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000)
    return cachedToken.token;
  const res = await politeFetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${creds.id}:${creds.secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

export function redditQueries(competitorName: string): string[] {
  return [
    `"${competitorName}" alternative`,
    `"${competitorName}" problem`,
    `"${competitorName}" cancel subscription`,
    `"${competitorName}" switching from`,
  ];
}

async function searchOnce(
  q: string,
  limit: number,
  token: string | null,
): Promise<{ posts: RedditPost[]; status: number }> {
  const base = token
    ? "https://oauth.reddit.com/search.json"
    : "https://www.reddit.com/search.json";
  const url = `${base}?q=${encodeURIComponent(q)}&sort=relevance&t=year&limit=${limit}`;
  const res = await politeFetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) return { posts: [], status: res.status };
  const data = (await res.json()) as { data?: { children?: RedditPost[] } };
  return { posts: data.data?.children ?? [], status: res.status };
}

export async function mineReddit(
  competitorName: string,
  { maxPerQuery = 25 }: { maxPerQuery?: number } = {},
): Promise<ConnectorResult> {
  const items: RawComplaint[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  const token = await getAccessToken().catch(() => null);

  let blocked = false;
  for (const q of redditQueries(competitorName)) {
    if (blocked) break;
    try {
      const { posts, status } = await searchOnce(q, maxPerQuery, token);
      if (status === 403 || status === 401) {
        warnings.push(
          token
            ? `reddit: ${status} even with OAuth — check credentials in Settings`
            : "reddit: blocked without API credentials. Create a free app at reddit.com/prefs/apps and add the client id/secret in Settings.",
        );
        blocked = true;
        break;
      }
      if (status !== 200) {
        warnings.push(`reddit: ${status} for query "${q}"`);
        continue;
      }
      for (const child of posts) {
        const d = child.data;
        if (!d?.id || seen.has(d.id)) continue;
        seen.add(d.id);
        const body = [d.title, d.selftext ?? d.body ?? ""]
          .filter(Boolean)
          .join("\n\n")
          .trim();
        if (body.length < 30) continue;
        items.push({
          source: "reddit",
          externalId: d.id,
          url: d.permalink ? `https://www.reddit.com${d.permalink}` : "",
          author: d.author ?? "",
          title: d.title ?? "",
          body: body.slice(0, 4000),
          postedAt: d.created_utc ? d.created_utc * 1000 : null,
        });
      }
      await sleep(1100); // respect rate limits between queries
    } catch (e) {
      warnings.push(`reddit: ${(e as Error).message} for query "${q}"`);
    }
  }
  return { items, warnings };
}
