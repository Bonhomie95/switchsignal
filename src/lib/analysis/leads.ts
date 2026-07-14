import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Complaint, Lead } from "@/db";
import { db, leads } from "@/db";
import { completeJSON } from "@/lib/llm";
import { DraftSchema, type ProductProfile } from "./schemas";

export type StyleVariant = "concise" | "warm" | "direct" | "resurface";

const STYLE_GUIDES: Record<StyleVariant, string> = {
  concise: "Keep it to 2 short sentences. Lead with the fix, then the trial offer.",
  warm: "Open by empathizing with their frustration in one sentence, then offer the fix. 3-4 sentences.",
  direct: "State plainly that your product solves their exact issue and why. 2-3 sentences, no preamble.",
  resurface:
    "They asked for this feature and you have now BUILT it. Reference that you shipped exactly what they wanted. 2-3 sentences, no hard sell.",
};

const DRAFT_SYSTEM = `You draft a reply to someone who publicly complained about a competitor product. The reply will be posted BY A HUMAN, in the channel where the complaint lives, only after they review and approve it.

Hard rules:
- Be genuinely helpful first; address their specific complaint.
- Disclose that the sender built the product ("I'm building...", "we made...").
- No hype, no marketing-speak, no exclamation marks, no emoji.
- Mention a free trial at most once.
- Never pretend to be a neutral user. Never disparage the competitor.
Respond with ONLY JSON: {"message": string}`;

export function channelForSource(source: Complaint["source"]): Lead["channel"] {
  switch (source) {
    case "reddit":
      return "reddit";
    case "hn":
      return "hn";
    case "github":
      return "forum";
    default:
      return "other";
  }
}

/** Which sources allow direct public replies (vs. intel-only sources like app store reviews). */
export function isContactableSource(source: Complaint["source"]): boolean {
  return source === "reddit" || source === "hn" || source === "github" || source === "demo";
}

/**
 * The feedback flywheel: the user's own approved/sent messages become few-shot
 * examples so future drafts match their voice. We prefer the finalMessage
 * (what they actually posted) over the AI's original draft.
 */
export function styleExamples(productId: number, limit = 3): string[] {
  return db
    .select({ msg: leads.finalMessage })
    .from(leads)
    .where(
      and(
        eq(leads.productId, productId),
        inArray(leads.status, ["approved", "sent", "replied", "trial", "converted"]),
        sql`length(${leads.finalMessage}) > 0`,
      ),
    )
    .orderBy(desc(leads.updatedAt))
    .limit(limit)
    .all()
    .map((r) => r.msg)
    .filter(Boolean);
}

/**
 * A/B style rotation: pick the least-used variant so every style accumulates
 * reply data. `resurface` is excluded from rotation (used explicitly on ship).
 */
export function nextStyleVariant(productId: number): StyleVariant {
  const variants: StyleVariant[] = ["concise", "warm", "direct"];
  const counts = new Map<string, number>(variants.map((v) => [v, 0]));
  for (const r of db
    .select({ v: leads.styleVariant, n: sql<number>`count(*)` })
    .from(leads)
    .where(eq(leads.productId, productId))
    .groupBy(leads.styleVariant)
    .all()) {
    if (r.v && counts.has(r.v)) counts.set(r.v, Number(r.n));
  }
  return variants.reduce((a, b) => ((counts.get(b) ?? 0) < (counts.get(a) ?? 0) ? b : a));
}

export async function draftReply(
  ourProfile: ProductProfile,
  competitorName: string,
  complaint: Pick<Complaint, "title" | "body" | "source" | "category" | "feature">,
  style: StyleVariant = "concise",
  examples: string[] = [],
): Promise<string> {
  const exampleBlock = examples.length
    ? `\n\nMatch the voice of these messages the sender previously approved:\n${examples
        .map((e, i) => `${i + 1}. ${e}`)
        .join("\n")}`
    : "";
  const res = await completeJSON(
    {
      tag: "draft",
      system: DRAFT_SYSTEM,
      prompt: `OUR product: ${ourProfile.name} — ${ourProfile.description}\nRelevant features: ${ourProfile.features.join(", ")}\n\nStyle: ${STYLE_GUIDES[style]}\n\nTheir complaint (about ${competitorName}, on ${complaint.source}, category: ${complaint.category}, feature: ${complaint.feature ?? "n/a"}):\n${complaint.title}\n${complaint.body.slice(0, 1500)}${exampleBlock}\n\nDraft the reply.`,
      temperature: 0.5,
      maxTokens: 400,
    },
    DraftSchema,
  );
  return res.message;
}

/** Reply-rate per style variant, for the Leads analytics strip. */
export interface StyleStat {
  variant: string;
  sent: number;
  replied: number;
  replyRate: number;
}

export function styleStats(): StyleStat[] {
  const rows = db
    .select({
      variant: leads.styleVariant,
      status: leads.status,
      n: sql<number>`count(*)`,
    })
    .from(leads)
    .where(inArray(leads.status, ["sent", "replied", "trial", "converted"]))
    .groupBy(leads.styleVariant, leads.status)
    .all();
  const acc = new Map<string, { sent: number; replied: number }>();
  for (const r of rows) {
    const v = r.variant ?? "unknown";
    const cur = acc.get(v) ?? { sent: 0, replied: 0 };
    cur.sent += Number(r.n);
    // sent is terminal-inclusive: replied/trial/converted all imply a reply
    if (r.status !== "sent") cur.replied += Number(r.n);
    acc.set(v, cur);
  }
  return [...acc.entries()]
    .map(([variant, s]) => ({
      variant,
      sent: s.sent,
      replied: s.replied,
      replyRate: s.sent ? Math.round((s.replied / s.sent) * 100) : 0,
    }))
    .sort((a, b) => b.replyRate - a.replyRate);
}
