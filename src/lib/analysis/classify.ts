import { z } from "zod";
import { completeJSON } from "@/lib/llm";
import {
  type Classification,
  ClassificationSchema,
  type ProductProfile,
} from "./schemas";

const SYSTEM = `You classify a public post/review/issue about a competitor product. Decide whether it expresses genuine dissatisfaction from a real user (a complaint), and score it. Respond with ONLY JSON:
{
 "is_complaint": boolean,          // false for praise, news, spam, or posts that merely mention the product
 "category": "pricing"|"missing_feature"|"bug_reliability"|"ux"|"support"|"performance"|"privacy"|"lock_in"|"other"|"not_a_complaint",
 "feature": string|null,           // the specific feature/capability at issue, short lowercase phrase
 "payer_score": 0..1,              // evidence the author PAYS: plan names, "my subscription", team size, invoices
 "intent_score": 0..1,             // evidence they want to SWITCH: "looking for alternative", "about to cancel"
 "fit_score": 0..1,                // would OUR product (profile below) solve this complaint today?
 "sentiment": -1..1,
 "severity": 0..1,                 // how badly this hurts the author's workflow
 "note": string                    // one short sentence of reasoning
}`;

const TRIAGE_SYSTEM = `You decide whether a post expresses genuine dissatisfaction from a real user of the product mentioned. Praise, news, questions, spam, or posts that merely mention the product are NOT complaints. Respond with ONLY JSON: {"is_complaint": boolean}`;

const TriageSchema = z.object({ is_complaint: z.coerce.boolean() });

/**
 * Cheap first pass (~50 output tokens). Only posts that pass get the full
 * scoring prompt — roughly halves token burn on noisy sources.
 */
export async function triageComplaint(
  competitorName: string,
  post: { title: string; body: string },
): Promise<boolean> {
  const res = await completeJSON(
    {
      tag: "triage",
      system: TRIAGE_SYSTEM,
      prompt: `Product: ${competitorName}\n\nPost:\n${post.title}\n${post.body.slice(0, 1200)}`,
      temperature: 0,
      maxTokens: 30,
    },
    TriageSchema,
  );
  return res.is_complaint;
}

export async function classifyComplaint(
  ourProfile: ProductProfile,
  competitorName: string,
  post: { title: string; body: string; source: string },
): Promise<Classification> {
  return completeJSON(
    {
      tag: "classify",
      system: SYSTEM,
      prompt: `OUR product profile:\n${JSON.stringify({
        name: ourProfile.name,
        category: ourProfile.category,
        features: ourProfile.features,
        differentiators: ourProfile.differentiators,
      })}\n\nCompetitor being discussed: ${competitorName}\nSource: ${post.source}\n\nPost:\ntitle: ${post.title}\n${post.body.slice(0, 3000)}`,
      temperature: 0.1,
      maxTokens: 500,
    },
    ClassificationSchema,
  );
}

/** Map-with-concurrency. The Groq key pool enforces per-key limits underneath;
 * this just bounds how many classification calls are in flight at once. */
export async function mapConcurrent<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i], i) };
      } catch (e) {
        results[i] = { status: "rejected", reason: e };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

export { leadScore, round2 } from "./scoring";
