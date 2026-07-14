import { describe, expect, it } from "vitest";
import { leadScore } from "@/lib/analysis/scoring";
import {
  normalizeComplaintVolume,
  opportunityScore,
} from "@/lib/scout/score";

describe("leadScore", () => {
  it("is zero when intent or fit is zero (they gate the score)", () => {
    expect(
      leadScore({ payerScore: 1, intentScore: 0, fitScore: 1, severity: 1 }),
    ).toBe(0);
    expect(
      leadScore({ payerScore: 1, intentScore: 1, fitScore: 0, severity: 1 }),
    ).toBe(0);
  });

  it("is maximal for a paying, high-intent, perfect-fit, severe complaint", () => {
    expect(
      leadScore({ payerScore: 1, intentScore: 1, fitScore: 1, severity: 1 }),
    ).toBe(1);
  });

  it("ranks paying complainers above free ones, all else equal", () => {
    const paying = leadScore({ payerScore: 0.9, intentScore: 0.7, fitScore: 0.8, severity: 0.5 });
    const free = leadScore({ payerScore: 0.1, intentScore: 0.7, fitScore: 0.8, severity: 0.5 });
    expect(paying).toBeGreaterThan(free);
  });

  it("treats null scores as zero", () => {
    expect(
      leadScore({ payerScore: null, intentScore: null, fitScore: null, severity: null }),
    ).toBe(0);
  });
});

describe("opportunityScore", () => {
  const base = {
    revenueSignal: 0.8,
    payerVolume: 0.7,
    complaintVolume: 0.6,
    feasibility: 0.7,
    competitionThinness: 0.5,
  };

  it("stays within 0..1", () => {
    expect(opportunityScore(base)).toBeGreaterThan(0);
    expect(opportunityScore(base)).toBeLessThanOrEqual(1);
    expect(
      opportunityScore({
        revenueSignal: 1,
        payerVolume: 1,
        complaintVolume: 1,
        feasibility: 1,
        competitionThinness: 1,
      }),
    ).toBe(1);
  });

  it("drags the score down hard when one signal is dead", () => {
    const healthy = opportunityScore(base);
    const deadRevenue = opportunityScore({ ...base, revenueSignal: 0 });
    expect(deadRevenue).toBeLessThan(healthy * 0.55);
  });

  it("weights revenue more than competition thinness", () => {
    const lowRev = opportunityScore({ ...base, revenueSignal: 0.2 });
    const lowComp = opportunityScore({ ...base, competitionThinness: 0.2 });
    expect(lowComp).toBeGreaterThan(lowRev);
  });

  it("clamps out-of-range inputs instead of exploding", () => {
    const s = opportunityScore({
      revenueSignal: 5,
      payerVolume: -3,
      complaintVolume: NaN,
      feasibility: 0.5,
      competitionThinness: 0.5,
    });
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });
});

describe("normalizeComplaintVolume", () => {
  it("is 0 for no complaints and saturates for many", () => {
    expect(normalizeComplaintVolume(0)).toBe(0);
    expect(normalizeComplaintVolume(10)).toBeGreaterThan(0.3);
    expect(normalizeComplaintVolume(100)).toBeGreaterThan(0.75);
    expect(normalizeComplaintVolume(100)).toBeLessThanOrEqual(1);
  });

  it("weights severity", () => {
    expect(normalizeComplaintVolume(20, 1)).toBeGreaterThan(
      normalizeComplaintVolume(20, 0),
    );
  });
});
