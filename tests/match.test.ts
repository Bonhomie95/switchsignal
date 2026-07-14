import { describe, expect, it } from "vitest";
import {
  mentionsProduct,
  nameSimilarity,
  STORE_MATCH_THRESHOLD,
} from "@/lib/connectors/match";

describe("mentionsProduct", () => {
  it("matches whole-word product mentions", () => {
    expect(mentionsProduct("I switched from Notion last week", "Notion")).toBe(true);
    expect(mentionsProduct("notion is overpriced imo", "Notion")).toBe(true);
    expect(mentionsProduct("Try Notion.", "Notion")).toBe(true);
  });

  it("rejects the word embedded in other words", () => {
    expect(mentionsProduct("I had a preconceived notional idea", "Notion")).toBe(false);
    expect(mentionsProduct("prenotion of doom", "Notion")).toBe(false);
  });

  it("handles multi-word names and regex specials", () => {
    expect(mentionsProduct("GhostBlock Pro keeps crashing", "GhostBlock Pro")).toBe(true);
    expect(mentionsProduct("using c++ builder (pro) daily", "builder (pro)")).toBe(true);
  });
});

describe("nameSimilarity", () => {
  it("scores real store matches above the threshold", () => {
    expect(nameSimilarity("Notion", "Notion: Notes, Docs, Tasks")).toBeGreaterThanOrEqual(
      STORE_MATCH_THRESHOLD,
    );
    expect(nameSimilarity("Slack", "Slack")).toBeGreaterThanOrEqual(STORE_MATCH_THRESHOLD);
  });

  it("scores unrelated apps below the threshold", () => {
    expect(nameSimilarity("Competitor 1 (mock)", "Solitaire Card Game")).toBeLessThan(
      STORE_MATCH_THRESHOLD,
    );
    expect(nameSimilarity("GhostBlock Pro", "Ghost Hunter 3D")).toBeLessThan(
      STORE_MATCH_THRESHOLD,
    );
  });
});
