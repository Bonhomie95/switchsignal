import { describe, expect, it } from "vitest";
import {
  hammingDistance,
  isNearDuplicate,
  simhash,
} from "@/lib/analysis/simhash";

describe("simhash", () => {
  const post =
    "I've been on the paid plan for two years but since v9 every page takes 3+ seconds to load. Support keeps blaming my extensions. Genuinely looking for an alternative that doesn't tank performance.";

  it("is deterministic", () => {
    expect(simhash(post)).toBe(simhash(post));
    expect(simhash(post)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("flags trivially edited copies as near-duplicates", () => {
    const copy = post.replace("Genuinely", "Honestly").replace("v9", "v9.2");
    expect(isNearDuplicate(simhash(post), simhash(copy))).toBe(true);
  });

  it("flags cross-posts with an added suffix", () => {
    const crosspost = `${post} (also posted in r/software)`;
    expect(isNearDuplicate(simhash(post), simhash(crosspost))).toBe(true);
  });

  it("does not flag unrelated posts", () => {
    const other =
      "The new dashboard design is great but I wish the mobile app supported offline mode. Otherwise no complaints, support answered within a day.";
    expect(isNearDuplicate(simhash(post), simhash(other))).toBe(false);
    expect(hammingDistance(simhash(post), simhash(other))).toBeGreaterThan(12);
  });

  it("does not flag a same-topic rewrite (different author, own words)", () => {
    const rewrite =
      "Every page takes 3+ seconds to load since v9 and support keeps blaming my extensions. I pay for this!";
    expect(isNearDuplicate(simhash(post), simhash(rewrite))).toBe(false);
  });

  it("handles very short and empty text without exploding", () => {
    expect(simhash("")).toBe("0".repeat(16));
    expect(isNearDuplicate(simhash(""), simhash(""))).toBe(false); // empty ≠ dup
    expect(simhash("ok bad app")).toMatch(/^[0-9a-f]{16}$/);
  });
});
