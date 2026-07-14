import type { Competitor } from "@/db";
import { mineAppStore } from "./appstore";
import { mineGithubIssues } from "./github";
import { mineHN } from "./hn";
import { minePlayStore } from "./playstore";
import { mineReddit } from "./reddit";
import { cursorFor, isTripped, recordFailure, recordSuccess } from "./state";
import { mineTrustpilot } from "./trustpilot";
import type { ConnectorResult, RawComplaint } from "./types";

export * from "./types";
export { mineReddit, redditQueries, getRedditToken } from "./reddit";
export { checkHNReply, checkRedditReply, type ReplyCheck } from "./threads";
export { mineHN } from "./hn";
export { mineAppStore, findAppStoreApp } from "./appstore";
export { minePlayStore } from "./playstore";
export { mineTrustpilot, extractDomain } from "./trustpilot";
export { mineGithubIssues, parseGithubRepo } from "./github";
export { mentionsProduct, nameSimilarity } from "./match";
export { webSearch, hasSearchKey } from "./search";
export { fetchPageText } from "./page";
export { politeFetch, htmlToText } from "./http";
export * from "./state";

/**
 * Mine every applicable source for one competitor. Connectors are isolated:
 * one failing source only adds a warning, never kills the run.
 */
export async function mineCompetitor(
  competitor: Pick<Competitor, "id" | "name" | "url">,
  onProgress?: (msg: string) => void,
): Promise<ConnectorResult> {
  // canonical source keys must match what RawComplaint.source uses, so the
  // cursor/circuit-breaker state lines up with what's stored.
  const tasks: { label: string; source: string; run: () => Promise<ConnectorResult> }[] = [
    { label: "reddit", source: "reddit", run: () => mineReddit(competitor.name) },
    { label: "hackernews", source: "hn", run: () => mineHN(competitor.name) },
    { label: "appstore", source: "appstore", run: () => mineAppStore(competitor.name) },
    { label: "playstore", source: "playstore", run: () => minePlayStore(competitor.name) },
    { label: "trustpilot", source: "trustpilot", run: () => mineTrustpilot(competitor.url) },
  ];
  if (/github\.com/i.test(competitor.url)) {
    tasks.push({ label: "github", source: "github", run: () => mineGithubIssues(competitor.url) });
  }

  const items: RawComplaint[] = [];
  const warnings: string[] = [];
  // Sources run in parallel — they hit different hosts, so no shared rate limit.
  const results = await Promise.allSettled(
    tasks.map(async (t) => {
      // circuit breaker: skip sources that have been failing
      if (isTripped(competitor.id, t.source)) {
        return { skipped: true as const, label: t.label, source: t.source };
      }
      onProgress?.(`mining ${t.label} for ${competitor.name}…`);
      const res = await t.run();
      return { skipped: false as const, label: t.label, source: t.source, res };
    }),
  );
  results.forEach((r, i) => {
    const task = tasks[i];
    if (r.status === "fulfilled") {
      if (r.value.skipped) {
        warnings.push(`${task.label}: skipped (circuit breaker open)`);
        return;
      }
      const { res } = r.value;
      // incremental cursor: only keep items newer than what we've seen
      const cursor = cursorFor(competitor.id, task.source);
      const fresh = res.items.filter((it) => (it.postedAt ?? Date.now()) > cursor);
      items.push(...fresh);
      warnings.push(...res.warnings);
      const newest = res.items.reduce((m, it) => Math.max(m, it.postedAt ?? 0), cursor);
      recordSuccess(competitor.id, task.source, fresh.length, newest);
    } else {
      const msg = r.reason?.message ?? String(r.reason);
      warnings.push(`${task.label}: ${msg}`);
      recordFailure(competitor.id, task.source, msg);
    }
  });
  return { items, warnings };
}
