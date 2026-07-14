import { politeFetch } from "./http";
import type { ConnectorResult, RawComplaint } from "./types";

/** Extract owner/repo if a competitor URL points at GitHub. */
export function parseGithubRepo(url: string): { owner: string; repo: string } | null {
  const m = url.match(/github\.com\/([\w.-]+)\/([\w.-]+)/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
}

/** Public GitHub issues — feature requests and bug reports are the highest-
 * signal complaints for dev tools. Unauthenticated; GITHUB_TOKEN optional. */
export async function mineGithubIssues(
  repoUrl: string,
  { max = 60 }: { max?: number } = {},
): Promise<ConnectorResult> {
  const repo = parseGithubRepo(repoUrl);
  if (!repo) return { items: [], warnings: [] };
  const warnings: string[] = [];
  const items: RawComplaint[] = [];
  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
    };
    if (process.env.GITHUB_TOKEN)
      headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    const url = `https://api.github.com/repos/${repo.owner}/${repo.repo}/issues?state=open&sort=comments&direction=desc&per_page=${Math.min(max, 100)}`;
    const res = await politeFetch(url, { headers });
    if (!res.ok) {
      return { items, warnings: [`github: ${res.status} for ${repo.owner}/${repo.repo}`] };
    }
    const issues = (await res.json()) as {
      number: number;
      title: string;
      body?: string | null;
      html_url: string;
      user?: { login?: string };
      created_at?: string;
      pull_request?: unknown;
    }[];
    for (const issue of issues) {
      if (issue.pull_request) continue;
      const body = `${issue.title}\n\n${issue.body ?? ""}`.trim();
      if (body.length < 20) continue;
      items.push({
        source: "github",
        externalId: `${repo.owner}/${repo.repo}#${issue.number}`,
        url: issue.html_url,
        author: issue.user?.login ?? "",
        title: issue.title,
        body: body.slice(0, 4000),
        postedAt: issue.created_at ? Date.parse(issue.created_at) || null : null,
      });
    }
  } catch (e) {
    warnings.push(`github: ${(e as Error).message}`);
  }
  return { items, warnings };
}
