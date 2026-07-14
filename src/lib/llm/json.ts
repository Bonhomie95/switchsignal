import type { z } from "zod";

/**
 * Extract a JSON value from LLM output that may be wrapped in prose or
 * markdown fences. Tries, in order: whole string, fenced block, first
 * balanced {...} or [...] region.
 */
export function extractJson(raw: string): unknown {
  const text = raw.trim();
  const attempts: string[] = [text];

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) attempts.push(fence[1].trim());

  for (const open of ["{", "["]) {
    const close = open === "{" ? "}" : "]";
    const start = text.indexOf(open);
    if (start === -1) continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (esc) {
        esc = false;
        continue;
      }
      if (c === "\\") {
        esc = true;
        continue;
      }
      if (c === '"') inStr = !inStr;
      if (inStr) continue;
      if (c === open) depth++;
      else if (c === close) {
        depth--;
        if (depth === 0) {
          attempts.push(text.slice(start, i + 1));
          break;
        }
      }
    }
  }

  for (const a of attempts) {
    try {
      return JSON.parse(a);
    } catch {
      /* next attempt */
    }
  }
  throw new Error(`Could not extract JSON from LLM output: ${text.slice(0, 200)}`);
}

export function parseWith<T>(schema: z.ZodType<T>, raw: string): T {
  return schema.parse(extractJson(raw));
}
