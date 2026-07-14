import { and, eq, isNull, sql } from "drizzle-orm";
import { complaints, db, featureClusters } from "@/db";

/**
 * Semantic feature clustering — the $0 replacement for pgvector.
 *
 * Free-text feature strings from the classifier ("sso / team management" vs
 * "team sso") split demand across spellings in the Gap Report. We embed each
 * complaint locally (MiniLM via transformers.js, ~25MB model cached on first
 * use) and greedily assign it to the nearest cluster centroid; clusters become
 * the canonical features reports group by. If the model can't load (offline,
 * unsupported platform), we fall back to normalized-string clustering.
 */

const SIMILARITY_THRESHOLD = 0.78;

type Embedder = (texts: string[]) => Promise<number[][]>;

const g = globalThis as unknown as {
  __embedder?: Promise<Embedder | null>;
};

function loadEmbedder(): Promise<Embedder | null> {
  if (!g.__embedder) {
    g.__embedder = (async () => {
      try {
        const { pipeline } = await import("@huggingface/transformers");
        const extractor = await pipeline(
          "feature-extraction",
          "Xenova/all-MiniLM-L6-v2",
          { dtype: "q8" },
        );
        return async (texts: string[]) => {
          const out = await extractor(texts, { pooling: "mean", normalize: true });
          const [n, dim] = out.dims as [number, number];
          const data = out.data as Float32Array;
          return Array.from({ length: n }, (_, i) =>
            Array.from(data.slice(i * dim, (i + 1) * dim)),
          );
        };
      } catch {
        return null; // embeddings unavailable → string fallback
      }
    })();
  }
  return g.__embedder;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

/** Pure greedy assignment used by both the real path and tests. */
export function assignToClusters(
  items: { id: number; label: string; vector: number[] }[],
  existing: { id: number; label: string; centroid: number[]; memberCount: number }[],
  threshold = SIMILARITY_THRESHOLD,
): {
  assignments: { itemId: number; clusterId: number }[];
  newClusters: { tempId: number; label: string; centroid: number[]; members: number[] }[];
  centroidUpdates: Map<number, { centroid: number[]; memberCount: number }>;
} {
  const assignments: { itemId: number; clusterId: number }[] = [];
  const newClusters: {
    tempId: number;
    label: string;
    centroid: number[];
    members: number[];
  }[] = [];
  const centroidUpdates = new Map<number, { centroid: number[]; memberCount: number }>();
  let nextTemp = -1;

  const state = existing.map((c) => ({ ...c }));

  for (const item of items) {
    let best: { idx: number; sim: number; isNew: boolean } | null = null;
    state.forEach((c, idx) => {
      const sim = cosine(item.vector, c.centroid);
      if (sim >= threshold && (!best || sim > best.sim))
        best = { idx, sim, isNew: false };
    });
    newClusters.forEach((c, idx) => {
      const sim = cosine(item.vector, c.centroid);
      if (sim >= threshold && (!best || sim > best.sim))
        best = { idx, sim, isNew: true };
    });

    if (best === null) {
      newClusters.push({
        tempId: nextTemp--,
        label: item.label,
        centroid: [...item.vector],
        members: [item.id],
      });
    } else if ((best as { isNew: boolean }).isNew) {
      const { idx } = best as { idx: number };
      const c = newClusters[idx];
      c.centroid = mergeCentroid(c.centroid, c.members.length, item.vector);
      c.members.push(item.id);
    } else {
      const { idx } = best as { idx: number };
      const c = state[idx];
      c.centroid = mergeCentroid(c.centroid, c.memberCount, item.vector);
      c.memberCount++;
      assignments.push({ itemId: item.id, clusterId: c.id });
      centroidUpdates.set(c.id, { centroid: c.centroid, memberCount: c.memberCount });
    }
  }
  return { assignments, newClusters, centroidUpdates };
}

function mergeCentroid(centroid: number[], count: number, vec: number[]): number[] {
  return centroid.map((v, i) => (v * count + vec[i]) / (count + 1));
}

/** Normalized-string fallback when the embedding model is unavailable. */
function normalizeFeature(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Embed + cluster every classified-but-unclustered complaint of a product. */
export async function clusterProductComplaints(productId: number): Promise<number> {
  const rows = db
    .select()
    .from(complaints)
    .where(
      and(
        eq(complaints.productId, productId),
        eq(complaints.status, "classified"),
        isNull(complaints.clusterId),
        sql`${complaints.category} != 'not_a_complaint'`,
      ),
    )
    .all();
  if (!rows.length) return 0;

  const embed = await loadEmbedder();

  if (!embed) {
    // fallback: exact normalized-feature grouping
    for (const row of rows) {
      const label = normalizeFeature(row.feature ?? row.category ?? "other");
      const found = db
        .select({ id: featureClusters.id })
        .from(featureClusters)
        .where(
          and(eq(featureClusters.productId, productId), eq(featureClusters.label, label)),
        )
        .get();
      const clusterId = found
        ? found.id
        : Number(
            db
              .insert(featureClusters)
              .values({ productId, label, centroidJson: "[]", memberCount: 0 })
              .run().lastInsertRowid,
          );
      db.update(complaints)
        .set({ clusterId })
        .where(eq(complaints.id, row.id))
        .run();
      db.update(featureClusters)
        .set({ memberCount: sql`${featureClusters.memberCount} + 1` })
        .where(eq(featureClusters.id, clusterId))
        .run();
    }
    return rows.length;
  }

  const texts = rows.map(
    (r) => `${r.feature ?? ""}. ${r.title}. ${r.body.slice(0, 400)}`,
  );
  const vectors = await embed(texts);

  const existing = db
    .select()
    .from(featureClusters)
    .where(eq(featureClusters.productId, productId))
    .all()
    .filter((c) => c.centroidJson !== "[]")
    .map((c) => ({
      id: c.id,
      label: c.label,
      centroid: JSON.parse(c.centroidJson) as number[],
      memberCount: c.memberCount,
    }));

  const items = rows.map((r, i) => ({
    id: r.id,
    label: r.feature ?? r.category ?? "other",
    vector: vectors[i],
  }));

  const { assignments, newClusters, centroidUpdates } = assignToClusters(items, existing);

  for (const [clusterId, update] of centroidUpdates) {
    db.update(featureClusters)
      .set({
        centroidJson: JSON.stringify(update.centroid),
        memberCount: update.memberCount,
      })
      .where(eq(featureClusters.id, clusterId))
      .run();
  }
  for (const a of assignments) {
    db.update(complaints)
      .set({
        clusterId: a.clusterId,
        embeddingJson: JSON.stringify(items.find((i) => i.id === a.itemId)?.vector ?? []),
      })
      .where(eq(complaints.id, a.itemId))
      .run();
  }
  for (const nc of newClusters) {
    const res = db
      .insert(featureClusters)
      .values({
        productId,
        label: nc.label,
        centroidJson: JSON.stringify(nc.centroid),
        memberCount: nc.members.length,
      })
      .run();
    const clusterId = Number(res.lastInsertRowid);
    for (const memberId of nc.members) {
      db.update(complaints)
        .set({
          clusterId,
          embeddingJson: JSON.stringify(items.find((i) => i.id === memberId)?.vector ?? []),
        })
        .where(eq(complaints.id, memberId))
        .run();
    }
  }
  return rows.length;
}
