import { describe, expect, it } from "vitest";
import {
  budgetRemainingCalls,
  EST_TOKENS,
} from "@/lib/llm/usage";
import { assignToClusters, cosine } from "@/lib/analysis/cluster";
import { zScore } from "@/lib/analysis/spikes";
import { extractFigures } from "@/lib/scout/verify";
import { ftsQuery } from "@/lib/analysis/search";

describe("token budget", () => {
  it("returns unlimited when budget is 0", () => {
    expect(budgetRemainingCalls("classify", 0, 0)).toBe(Number.MAX_SAFE_INTEGER);
  });
  it("divides remaining tokens by per-call cost", () => {
    const budget = 100_000;
    const used = 10_000;
    const expected = Math.floor((budget - used) / EST_TOKENS.classify);
    expect(budgetRemainingCalls("classify", budget, used)).toBe(expected);
  });
  it("returns 0 when the budget is spent", () => {
    expect(budgetRemainingCalls("classify", 50_000, 50_000)).toBe(0);
    expect(budgetRemainingCalls("classify", 50_000, 60_000)).toBe(0);
  });
});

describe("cosine", () => {
  it("is 1 for identical vectors and 0 for orthogonal", () => {
    expect(cosine([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
  });
});

describe("assignToClusters", () => {
  it("groups similar vectors and separates dissimilar ones", () => {
    const items = [
      { id: 1, label: "sso", vector: [1, 0, 0] },
      { id: 2, label: "team sso", vector: [0.97, 0.02, 0] },
      { id: 3, label: "pricing", vector: [0, 1, 0] },
    ];
    const { newClusters } = assignToClusters(items, [], 0.9);
    // items 1 & 2 cluster together, item 3 is its own
    expect(newClusters.length).toBe(2);
    const big = newClusters.find((c) => c.members.length === 2);
    expect(big?.members.sort()).toEqual([1, 2]);
  });

  it("assigns to an existing cluster when close enough", () => {
    const existing = [
      { id: 10, label: "sso", centroid: [1, 0, 0], memberCount: 3 },
    ];
    const items = [{ id: 5, label: "team sso", vector: [0.98, 0.01, 0] }];
    const { assignments, newClusters } = assignToClusters(items, existing, 0.9);
    expect(newClusters.length).toBe(0);
    expect(assignments).toEqual([{ itemId: 5, clusterId: 10 }]);
  });
});

describe("zScore", () => {
  it("is 0 for insufficient history", () => {
    expect(zScore(5, [])).toBe(0);
    expect(zScore(5, [3])).toBe(0);
  });
  it("flags a clear spike as high", () => {
    expect(zScore(20, [2, 3, 1, 2, 3])).toBeGreaterThan(3);
  });
  it("stays low for values near the mean", () => {
    expect(Math.abs(zScore(3, [2, 3, 4, 3, 2]))).toBeLessThan(1.5);
  });
  it("treats any jump above a flat history as notable", () => {
    expect(zScore(5, [0, 0, 0, 0])).toBeGreaterThanOrEqual(3);
  });
});

describe("extractFigures", () => {
  it("pulls numeric figures from a revenue claim", () => {
    const figs = extractFigures("$32k MRR (open dashboard), 2023");
    expect(figs).toContain("32");
    expect(figs).toContain("2023");
  });
  it("handles claims with no figures", () => {
    expect(extractFigures("profitable and growing")).toEqual([]);
  });
});

describe("ftsQuery", () => {
  it("builds prefix-match tokens", () => {
    expect(ftsQuery("data loss")).toBe('"data"* "loss"*');
  });
  it("drops punctuation and short tokens", () => {
    expect(ftsQuery("a, slow!! sync")).toBe('"slow"* "sync"*');
  });
  it("is empty for empty input", () => {
    expect(ftsQuery("  ")).toBe("");
  });
});
