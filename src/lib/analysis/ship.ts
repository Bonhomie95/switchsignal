import { and, eq, inArray, sql } from "drizzle-orm";
import {
  competitors,
  complaints,
  db,
  featureClusters,
  leads,
  products,
  shippedFeatures,
} from "@/db";
import { channelForSource, isContactableSource } from "./leads";
import { draftReply, ProductProfileSchema } from "./index";
import { leadScore } from "./scoring";

/**
 * Ship-and-resurface: when the user marks a Gap feature as shipped, find every
 * past complaint about that feature whose fit is now effectively solved, and
 * (re)draft a "we built the thing you asked for" message — warm leads with
 * perfect context, for free.
 */
export async function shipFeature(
  productId: number,
  feature: string,
): Promise<{ resurfaced: number }> {
  const product = db.select().from(products).where(eq(products.id, productId)).get();
  if (!product?.profileJson) throw new Error("product has no profile");
  const profile = ProductProfileSchema.parse(JSON.parse(product.profileJson));

  db.insert(shippedFeatures)
    .values({ productId, feature })
    .onConflictDoNothing()
    .run();

  // complaints matching this feature — by cluster label or raw feature string
  const matching = db
    .select({ c: complaints, competitorName: competitors.name })
    .from(complaints)
    .leftJoin(featureClusters, eq(complaints.clusterId, featureClusters.id))
    .leftJoin(competitors, eq(complaints.competitorId, competitors.id))
    .where(
      and(
        eq(complaints.productId, productId),
        eq(complaints.status, "classified"),
        sql`${complaints.category} != 'not_a_complaint'`,
        sql`lower(coalesce(${featureClusters.label}, ${complaints.feature}, ${complaints.category})) = ${feature.toLowerCase()}`,
      ),
    )
    .all()
    .filter((r) => isContactableSource(r.c.source));

  if (!matching.length) return { resurfaced: 0 };

  const existingLeadByComplaint = new Map(
    db
      .select()
      .from(leads)
      .where(eq(leads.productId, productId))
      .all()
      .map((l) => [l.complaintId, l]),
  );

  let resurfaced = 0;
  for (const { c, competitorName } of matching) {
    let draft = "";
    try {
      draft = await draftReply(
        profile,
        competitorName ?? "the competitor",
        c,
        "resurface",
      );
    } catch {
      /* draft can be regenerated from the UI */
    }
    const existing = existingLeadByComplaint.get(c.id);
    if (existing) {
      // resurface an existing lead: re-open with the new angle
      db.update(leads)
        .set({
          draft: draft || existing.draft,
          styleVariant: "resurface",
          status: "drafted",
          notes: existing.notes
            ? `${existing.notes}\n[resurfaced: shipped ${feature}]`
            : `resurfaced: shipped ${feature}`,
          updatedAt: Date.now(),
        })
        .where(eq(leads.id, existing.id))
        .run();
    } else {
      db.insert(leads)
        .values({
          productId,
          complaintId: c.id,
          channel: channelForSource(c.source),
          score: Math.min(1, leadScore(c) + 0.15), // shipped-fix boost
          draft,
          styleVariant: "resurface",
          status: draft ? "drafted" : "new",
          notes: `resurfaced: shipped ${feature}`,
        })
        .onConflictDoNothing()
        .run();
    }
    resurfaced++;
  }

  db.update(shippedFeatures)
    .set({ resurfacedLeads: resurfaced })
    .where(and(eq(shippedFeatures.productId, productId), eq(shippedFeatures.feature, feature)))
    .run();

  return { resurfaced };
}

export function unshipFeature(productId: number, feature: string) {
  db.delete(shippedFeatures)
    .where(and(eq(shippedFeatures.productId, productId), eq(shippedFeatures.feature, feature)))
    .run();
}
