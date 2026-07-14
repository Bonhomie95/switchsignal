/** Pure scoring helpers — no DB or LLM imports so they're trivially testable. */

/** Composite lead score: how much this complaint is worth pursuing. */
export function leadScore(c: {
  payerScore: number | null;
  intentScore: number | null;
  fitScore: number | null;
  severity: number | null;
}): number {
  const payer = c.payerScore ?? 0;
  const intent = c.intentScore ?? 0;
  const fit = c.fitScore ?? 0;
  const severity = c.severity ?? 0;
  // intent and fit are gates; payer and severity are boosters
  return round2(intent * fit * (0.5 + 0.35 * payer + 0.15 * severity));
}

export function round2(n: number) {
  return Math.round(n * 100) / 100;
}
