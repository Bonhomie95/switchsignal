/**
 * Opportunity Score — geometric-style blend so one dead signal drags the
 * whole score down (a product with zero revenue evidence shouldn't rank high
 * on feasibility alone), with floors so missing data doesn't zero everything.
 */
export interface OpportunitySignals {
  revenueSignal: number; // 0–1: strength/reliability of revenue evidence
  payerVolume: number; //   0–1: how many paying customers exist
  complaintVolume: number; // 0–1: normalized volume+severity of complaints
  feasibility: number; //   0–1: inverse of estimated build complexity
  competitionThinness: number; // 0–1: few strong alternatives = high
}

const WEIGHTS: Record<keyof OpportunitySignals, number> = {
  revenueSignal: 0.3,
  payerVolume: 0.2,
  complaintVolume: 0.2,
  feasibility: 0.2,
  competitionThinness: 0.1,
};

const FLOOR = 0.05;

export function opportunityScore(s: OpportunitySignals): number {
  let log = 0;
  for (const [key, w] of Object.entries(WEIGHTS) as [
    keyof OpportunitySignals,
    number,
  ][]) {
    const v = clamp01(s[key]);
    log += w * Math.log(Math.max(v, FLOOR));
  }
  return round2(Math.exp(log));
}

/** Normalize a raw complaint count into 0–1 (saturates around ~40 complaints). */
export function normalizeComplaintVolume(count: number, avgSeverity = 0.5): number {
  const volume = 1 - Math.exp(-count / 15);
  return round2(clamp01(volume * (0.6 + 0.4 * avgSeverity)));
}

export function clamp01(n: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(n) ? n : 0));
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}
