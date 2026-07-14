import { htmlToText, politeFetch } from "./http";

/** Fetch a landing page / README for product profiling. Returns plain text. */
export async function fetchPageText(url: string, maxChars = 12_000): Promise<string> {
  // GitHub repo URLs: fetch the README directly for much better signal.
  const gh = url.match(/github\.com\/([\w.-]+)\/([\w.-]+)/i);
  if (gh) {
    for (const branch of ["main", "master"]) {
      try {
        const res = await politeFetch(
          `https://raw.githubusercontent.com/${gh[1]}/${gh[2].replace(/\.git$/, "")}/${branch}/README.md`,
        );
        if (res.ok) return (await res.text()).slice(0, maxChars);
      } catch {
        /* try next branch */
      }
    }
  }
  const res = await politeFetch(url);
  if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${url}`);
  const html = await res.text();
  return htmlToText(html).slice(0, maxChars);
}
