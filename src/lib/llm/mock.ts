import type { LLMProvider, LLMRequest } from "./types";

/** Deterministic 0..1 hash so mock scores vary per input but are stable. */
function hash01(s: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 1000) / 1000;
}

const CATEGORIES = [
  "pricing",
  "missing_feature",
  "bug_reliability",
  "ux",
  "support",
  "performance",
] as const;

/**
 * Mock provider: lets the entire pipeline run end-to-end with zero API keys.
 * Output is deterministic per prompt so tests are stable. Selected
 * automatically when no real key is configured, or explicitly in Settings.
 */
export class MockProvider implements LLMProvider {
  readonly name = "mock";

  async complete(req: LLMRequest): Promise<string> {
    const h = (salt = 0) => hash01(req.prompt, salt);
    switch (req.tag) {
      case "profile":
        return JSON.stringify({
          name: pickName(req.prompt) ?? "Untitled Product",
          category: "productivity software",
          description:
            "A software product (mock profile generated without an LLM key).",
          features: [
            "core workflow automation",
            "team collaboration",
            "reporting dashboard",
            "integrations",
          ],
          persona: "small teams and solo professionals",
          pricing: "freemium with paid tiers",
          differentiators: ["simpler onboarding", "lower price point"],
        });
      case "discover":
        return JSON.stringify({
          competitors: [1, 2, 3].map((i) => ({
            name: `Competitor ${i} (mock)`,
            url: `https://example.com/competitor-${i}`,
            summary: `A well-known alternative in this category (mock #${i}).`,
            features: ["feature A", "feature B"],
            pricing: `$${9 + i * 10}/mo`,
          })),
        });
      case "triage":
        return JSON.stringify({ is_complaint: h(1) > 0.25 });
      case "classify": {
        const isComplaint = h(1) > 0.25;
        return JSON.stringify({
          is_complaint: isComplaint,
          category: isComplaint
            ? CATEGORIES[Math.floor(h(2) * CATEGORIES.length)]
            : "not_a_complaint",
          feature: isComplaint ? `feature-${Math.ceil(h(3) * 5)}` : null,
          payer_score: round(h(4)),
          intent_score: round(h(5)),
          fit_score: round(h(6)),
          sentiment: round(-0.2 - h(7) * 0.8),
          severity: round(h(8)),
          note: "Mock classification (no LLM key configured).",
        });
      }
      case "draft":
        return JSON.stringify({
          message:
            "Hey — saw your post about the trouble you ran into. We're building a tool that handles exactly that case; happy to set you up with a free trial if you want to see whether it fixes it for you. (Mock draft — connect a Groq key for real drafts.)",
        });
      case "scout":
        return JSON.stringify({
          candidates: [1, 2, 3, 4].map((i) => ({
            name: `MockSaaS ${i}`,
            url: `https://example.com/mocksaas-${i}`,
            category: "b2b saas",
            summary: `Profitable small SaaS #${i} with visible complaints (mock).`,
            revenue_claim: `$${5 + i * 7}k MRR (self-reported)`,
            revenue_evidence: [
              {
                claim: `$${5 + i * 7}k MRR`,
                url: "https://example.com/evidence",
                source: "indiehackers",
                reliability: "medium",
              },
            ],
            revenue_signal: round(0.3 + h(i) * 0.7),
            payer_volume: round(0.2 + h(i + 10) * 0.8),
            feasibility: round(0.3 + h(i + 20) * 0.7),
            competition_thinness: round(h(i + 30)),
            why_winnable: "Recurring complaints about reliability and pricing (mock).",
          })),
        });
      default:
        return req.json
          ? JSON.stringify({ ok: true, note: "mock generic response" })
          : "Mock response (no LLM key configured).";
    }
  }
}

function round(n: number) {
  return Math.round(n * 100) / 100;
}

function pickName(prompt: string): string | null {
  const m = prompt.match(/(?:^|\n)\s*#\s+(.{2,60})/) ?? prompt.match(/name[:=]\s*"?([\w -]{2,40})/i);
  return m ? m[1].trim() : null;
}
