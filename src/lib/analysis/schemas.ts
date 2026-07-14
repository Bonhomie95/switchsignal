import { z } from "zod";

export const ProductProfileSchema = z.object({
  name: z.string().min(1),
  category: z.string(),
  description: z.string(),
  features: z.array(z.string()).min(1),
  persona: z.string(),
  pricing: z.string(),
  differentiators: z.array(z.string()),
});
export type ProductProfile = z.infer<typeof ProductProfileSchema>;

export const CompetitorSuggestionsSchema = z.object({
  competitors: z.array(
    z.object({
      name: z.string().min(1),
      url: z.string().default(""),
      summary: z.string().default(""),
      features: z.array(z.string()).default([]),
      pricing: z.string().default(""),
    }),
  ),
});
export type CompetitorSuggestions = z.infer<typeof CompetitorSuggestionsSchema>;

const score01 = z.coerce.number().min(0).max(1).catch(0);

export const ClassificationSchema = z.object({
  is_complaint: z.coerce.boolean(),
  category: z
    .enum([
      "pricing",
      "missing_feature",
      "bug_reliability",
      "ux",
      "support",
      "performance",
      "privacy",
      "lock_in",
      "other",
      "not_a_complaint",
    ])
    .catch("other"),
  feature: z.string().nullable().catch(null),
  payer_score: score01,
  intent_score: score01,
  fit_score: score01,
  sentiment: z.coerce.number().min(-1).max(1).catch(0),
  severity: score01,
  note: z.string().default(""),
});
export type Classification = z.infer<typeof ClassificationSchema>;

export const DraftSchema = z.object({
  message: z.string().min(1),
});

export const ScoutCandidatesSchema = z.object({
  candidates: z.array(
    z.object({
      name: z.string().min(1),
      url: z.string().default(""),
      category: z.string().default(""),
      summary: z.string().default(""),
      revenue_claim: z.string().default(""),
      revenue_evidence: z
        .array(
          z.object({
            claim: z.string(),
            url: z.string().default(""),
            source: z.string().default(""),
            reliability: z.enum(["low", "medium", "high"]).catch("low"),
          }),
        )
        .default([]),
      revenue_signal: score01,
      payer_volume: score01,
      feasibility: score01,
      competition_thinness: score01,
      why_winnable: z.string().default(""),
    }),
  ),
});
export type ScoutCandidates = z.infer<typeof ScoutCandidatesSchema>;
