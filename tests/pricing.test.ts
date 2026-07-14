import { describe, expect, it } from "vitest";
import { diffPlans } from "@/lib/analysis/pricing";

const plans = (
  ...ps: [string, string, string?][]
): { plan: string; price: string; period: string }[] =>
  ps.map(([plan, price, period]) => ({ plan, price, period: period ?? "/mo" }));

describe("diffPlans", () => {
  it("reports price changes", () => {
    const d = diffPlans(plans(["Pro", "$8"]), plans(["Pro", "$12"]));
    expect(d).toContain('"Pro": $8/mo → $12/mo');
  });

  it("reports added and removed plans", () => {
    const d = diffPlans(
      plans(["Free", "free", ""], ["Pro", "$8"]),
      plans(["Pro", "$8"], ["Team", "$20"]),
    );
    expect(d).toContain('new plan "Team" at $20/mo');
    expect(d).toContain('plan "Free" removed');
  });

  it("is empty when nothing changed", () => {
    expect(diffPlans(plans(["Pro", "$8"]), plans(["Pro", "$8"]))).toBe("");
  });

  it("matches plans case-insensitively", () => {
    expect(diffPlans(plans(["pro", "$8"]), plans(["Pro", "$8"]))).toBe("");
  });
});
