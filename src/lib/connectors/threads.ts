import { politeFetch } from "./http";

/**
 * Thread-reply detection for outreach follow-up. Given a permalink to a
 * complaint we replied to, and the user's own handle, detect whether anyone
 * replied *after* the user's comment — a signal the outreach got a response.
 *
 * Best-effort: any failure returns "unknown" and the lead is left as-is.
 */
export type ReplyCheck = "replied" | "no_reply" | "unknown";

/** Hacker News: the Algolia item API returns the full comment tree, free. */
export async function checkHNReply(
  storyOrItemId: string,
  userHandle: string,
): Promise<ReplyCheck> {
  try {
    const res = await politeFetch(`https://hn.algolia.com/api/v1/items/${storyOrItemId}`);
    if (!res.ok) return "unknown";
    const root = (await res.json()) as HNItem;
    const mine = findAuthorComments(root, userHandle.toLowerCase());
    if (!mine.length) return "unknown";
    // any child comment under one of the user's comments = a reply
    return mine.some((c) => (c.children ?? []).length > 0) ? "replied" : "no_reply";
  } catch {
    return "unknown";
  }
}

interface HNItem {
  author?: string;
  children?: HNItem[];
}

function findAuthorComments(node: HNItem, handle: string, acc: HNItem[] = []): HNItem[] {
  if (node.author?.toLowerCase() === handle) acc.push(node);
  for (const child of node.children ?? []) findAuthorComments(child, handle, acc);
  return acc;
}

/**
 * Reddit: the permalink + ".json" returns the comment tree. Requires the
 * OAuth token path the reddit connector already uses; we accept a token here.
 */
export async function checkRedditReply(
  permalink: string,
  userHandle: string,
  token: string | null,
): Promise<ReplyCheck> {
  try {
    const base = token ? "https://oauth.reddit.com" : "https://www.reddit.com";
    const path = permalink.replace(/^https?:\/\/[^/]+/, "").replace(/\/$/, "");
    const res = await politeFetch(`${base}${path}.json?limit=200`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return "unknown";
    const data = (await res.json()) as RedditListing[];
    const commentsTree = data[1]?.data?.children ?? [];
    const mine: RedditComment[] = [];
    for (const c of commentsTree) collectAuthor(c, userHandle.toLowerCase(), mine);
    if (!mine.length) return "unknown";
    return mine.some((c) => hasChildComments(c)) ? "replied" : "no_reply";
  } catch {
    return "unknown";
  }
}

interface RedditListing {
  data?: { children?: RedditComment[] };
}
interface RedditComment {
  kind?: string;
  data?: {
    author?: string;
    replies?: RedditListing | "";
  };
}

function collectAuthor(node: RedditComment, handle: string, acc: RedditComment[]) {
  if (node.data?.author?.toLowerCase() === handle) acc.push(node);
  const replies = node.data?.replies;
  if (replies && typeof replies !== "string")
    for (const child of replies.data?.children ?? []) collectAuthor(child, handle, acc);
}

function hasChildComments(node: RedditComment): boolean {
  const replies = node.data?.replies;
  if (!replies || typeof replies === "string") return false;
  return (replies.data?.children ?? []).some((c) => c.kind === "t1");
}
