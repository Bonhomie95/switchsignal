import { fetchPageText } from "@/lib/connectors";

export interface Evidence {
  claim: string;
  url: string;
  source: string;
  reliability: "low" | "medium" | "high";
  verified?: boolean;
}

/** Pull the salient "$25k", "25k MRR", "$1.2M" style figures from a claim. */
export function extractFigures(text: string): string[] {
  const out = new Set<string>();
  const re = /\$?\s?(\d[\d,.]*)\s?(k|m|mrr|arr|\/mo|\/month|\/yr)?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const num = m[1].replace(/[,.]/g, "");
    if (num.length >= 2) out.add(num);
  }
  return [...out];
}

/**
 * Anti-hallucination: fetch each evidence URL and check the claim's key
 * figures actually appear on the page. Unverifiable claims are downgraded to
 * "low" reliability and flagged. Best-effort — network failure leaves the
 * claim unverified rather than failing the scan.
 */
export async function verifyEvidence(evidence: Evidence[]): Promise<Evidence[]> {
  return Promise.all(
    evidence.map(async (e) => {
      if (!e.url || !/^https?:\/\//.test(e.url)) return { ...e, verified: false };
      try {
        const text = (await fetchPageText(e.url, 8000)).toLowerCase();
        const figures = extractFigures(e.claim);
        // if the claim cites figures, at least one must appear on the page
        const ok =
          figures.length === 0
            ? text.length > 200
            : figures.some((f) => text.includes(f));
        return {
          ...e,
          verified: ok,
          reliability: ok ? e.reliability : "low",
        };
      } catch {
        return { ...e, verified: false, reliability: "low" };
      }
    }),
  );
}
