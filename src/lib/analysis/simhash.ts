/**
 * 64-bit simhash for near-duplicate complaint detection — the $0 stand-in
 * for embedding similarity. Near-identical posts (cross-posts, copy-pasted
 * reviews) land within a few bits of each other.
 */

const MASK64 = (1n << 64n) - 1n;

/** FNV-1a 64-bit hash of a string. */
function fnv1a64(s: string): bigint {
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = (h * 0x100000001b3n) & MASK64;
  }
  return h;
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((t) => t.length > 2);
}

/** Simhash over word 3-shingles; returns 16-char hex. */
export function simhash(text: string): string {
  const ts = tokens(text);
  const shingles: string[] = [];
  if (ts.length < 3) shingles.push(...ts);
  else for (let i = 0; i + 2 < ts.length; i++) shingles.push(`${ts[i]} ${ts[i + 1]} ${ts[i + 2]}`);
  if (!shingles.length) return "0".repeat(16);

  const weights = new Array<number>(64).fill(0);
  for (const sh of shingles) {
    const h = fnv1a64(sh);
    for (let bit = 0; bit < 64; bit++) {
      weights[bit] += (h >> BigInt(bit)) & 1n ? 1 : -1;
    }
  }
  let out = 0n;
  for (let bit = 0; bit < 64; bit++) if (weights[bit] > 0) out |= 1n << BigInt(bit);
  return out.toString(16).padStart(16, "0");
}

export function hammingDistance(hexA: string, hexB: string): number {
  let x = BigInt(`0x${hexA}`) ^ BigInt(`0x${hexB}`);
  let count = 0;
  while (x) {
    x &= x - 1n;
    count++;
  }
  return count;
}

/**
 * Calibrated on real complaint text: exact copies score 0, cross-posts with
 * an added suffix ~7, light two-word edits ~11, while same-topic rewrites and
 * unrelated posts sit around 25. 12 splits those populations cleanly.
 */
export const NEAR_DUP_THRESHOLD = 12;

export function isNearDuplicate(hexA: string, hexB: string): boolean {
  if (hexA === "0".repeat(16) || hexB === "0".repeat(16)) return false;
  return hammingDistance(hexA, hexB) <= NEAR_DUP_THRESHOLD;
}
