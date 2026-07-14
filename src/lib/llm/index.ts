import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import { apiKeys, db, settings } from "@/db";
import { AnthropicProvider } from "./anthropic";
import { GroqProvider } from "./groq";
import { parseWith } from "./json";
import { KeyPool, type PoolKey } from "./keypool";
import { MockProvider } from "./mock";
import { LLMError, type LLMProvider, type LLMRequest } from "./types";
import { recordUsage } from "./usage";

export * from "./types";
export { extractJson } from "./json";
export { KeyPool } from "./keypool";
export { GroqProvider } from "./groq";
export { AnthropicProvider } from "./anthropic";
export { MockProvider } from "./mock";
export * from "./usage";

/** Groq keys = every active key in the DB plus GROQ_API_KEYS env (comma-separated). */
export function loadGroqKeys(): PoolKey[] {
  const rows = db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.provider, "groq"), eq(apiKeys.active, true)))
    .all();
  const keys: PoolKey[] = rows.map((r) => ({ id: r.id, key: r.key }));
  const env = (process.env.GROQ_API_KEYS ?? process.env.GROQ_API_KEY ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  env.forEach((k, i) => {
    if (!keys.some((existing) => existing.key === k))
      keys.push({ id: `env-${i}`, key: k });
  });
  return keys;
}

function loadAnthropicKey(): string | null {
  const row = db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.provider, "anthropic"), eq(apiKeys.active, true)))
    .get();
  return row?.key ?? process.env.ANTHROPIC_API_KEY ?? null;
}

export function getSetting(key: string): string | null {
  return db.select().from(settings).where(eq(settings.key, key)).get()?.value ?? null;
}

export function setSetting(key: string, value: string) {
  db.insert(settings)
    .values({ key, value, updatedAt: Date.now() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: Date.now() },
    })
    .run();
}

// Shared pool survives hot reloads so cooldown/inflight state isn't lost.
const g = globalThis as unknown as { __groqPool?: KeyPool };

function getGroqPool(): KeyPool {
  if (!g.__groqPool) {
    g.__groqPool = new KeyPool(loadGroqKeys(), {
      perKeyConcurrency: Number(process.env.GROQ_PER_KEY_CONCURRENCY ?? 4),
      onDisabled: (id) => {
        if (typeof id === "number")
          db.update(apiKeys).set({ active: false }).where(eq(apiKeys.id, id)).run();
      },
      onUsed: (id, count) => {
        if (typeof id === "number")
          db.update(apiKeys)
            .set({ requestCount: count, lastUsedAt: Date.now() })
            .where(eq(apiKeys.id, id))
            .run();
      },
    });
  }
  return g.__groqPool;
}

/** Call after the user adds/removes keys in Settings. */
export function refreshGroqPool() {
  getGroqPool().setKeys(loadGroqKeys());
}

export function groqPoolStats() {
  return getGroqPool().stats();
}

/**
 * Resolve the active provider:
 *  - explicit `llm_provider` setting wins (groq | anthropic | mock)
 *  - otherwise groq if any key exists, anthropic if any key exists, else mock
 */
export function getProvider(): LLMProvider {
  // "" (the Auto button) and null both mean: pick automatically.
  const chosen = getSetting("llm_provider") || null;
  const groqKeys = loadGroqKeys();
  const anthropicKey = loadAnthropicKey();

  const pick = chosen ?? (groqKeys.length ? "groq" : anthropicKey ? "anthropic" : "mock");
  const onUsage = (u: {
    model: string;
    tag: string;
    keyId: string | number;
    promptTokens: number;
    completionTokens: number;
  }) => recordUsage({ ...u, provider: pick, keyId: String(u.keyId) });
  switch (pick) {
    case "groq":
      if (!groqKeys.length) return new MockProvider();
      return new GroqProvider(groqKeys, { onUsage }, getGroqPool());
    case "anthropic":
      if (!anthropicKey) return new MockProvider();
      return new AnthropicProvider(anthropicKey, undefined, fetch, onUsage);
    default:
      return new MockProvider();
  }
}

/** Complete + parse + one retry with the validation error fed back. */
export async function completeJSON<T>(
  req: Omit<LLMRequest, "json">,
  schema: z.ZodType<T>,
): Promise<T> {
  const provider = getProvider();
  const raw = await provider.complete({ ...req, json: true });
  try {
    return parseWith(schema, raw);
  } catch (e) {
    const retry = await provider.complete({
      ...req,
      json: true,
      prompt: `${req.prompt}\n\nYour previous response could not be parsed (${(e as Error).message.slice(0, 200)}). Respond with ONLY valid JSON matching the requested shape.`,
    });
    try {
      return parseWith(schema, retry);
    } catch (e2) {
      throw new LLMError(
        `LLM returned unparseable JSON twice: ${(e2 as Error).message.slice(0, 300)}`,
      );
    }
  }
}
