import { KeyPool, NoKeysError, type PoolKey } from "./keypool";
import { LLMError, type LLMProvider, type LLMRequest } from "./types";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
export const DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile";

export interface GroqProviderOptions {
  model?: string;
  maxAttempts?: number;
  fetchFn?: typeof fetch;
  /** called with token usage after each successful completion */
  onUsage?: (u: {
    model: string;
    tag: string;
    keyId: string | number;
    promptTokens: number;
    completionTokens: number;
  }) => void;
}

export class GroqProvider implements LLMProvider {
  readonly name = "groq";
  readonly pool: KeyPool;
  private readonly model: string;
  private readonly maxAttempts: number;
  private readonly fetchFn: typeof fetch;
  private readonly onUsage?: GroqProviderOptions["onUsage"];

  constructor(keys: PoolKey[], opts: GroqProviderOptions = {}, pool?: KeyPool) {
    this.pool = pool ?? new KeyPool(keys);
    this.model = opts.model ?? process.env.GROQ_MODEL ?? DEFAULT_GROQ_MODEL;
    this.maxAttempts = opts.maxAttempts ?? 6;
    this.fetchFn = opts.fetchFn ?? fetch;
    this.onUsage = opts.onUsage;
  }

  async complete(req: LLMRequest): Promise<string> {
    let lastError: Error | undefined;
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      let slot;
      try {
        slot = await this.pool.acquire();
      } catch (e) {
        if (e instanceof NoKeysError)
          throw new LLMError(
            "All Groq API keys are disabled or invalid. Add a working key in Settings.",
          );
        throw e;
      }
      try {
        const res = await this.fetchFn(GROQ_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${slot.key}`,
          },
          body: JSON.stringify({
            model: this.model,
            temperature: req.temperature ?? 0.2,
            max_tokens: req.maxTokens ?? 2048,
            ...(req.json ? { response_format: { type: "json_object" } } : {}),
            messages: [
              ...(req.system ? [{ role: "system", content: req.system }] : []),
              { role: "user", content: req.prompt },
            ],
          }),
        });

        if (res.status === 429) {
          const retryAfter = Number(res.headers.get("retry-after"));
          slot.reportRateLimit(
            Number.isFinite(retryAfter) && retryAfter > 0
              ? retryAfter * 1000
              : undefined,
          );
          lastError = new LLMError("Groq rate limit (429)", true);
          continue; // retry with another key / after cooldown
        }
        if (res.status === 401 || res.status === 403) {
          slot.reportUnauthorized();
          lastError = new LLMError(`Groq key rejected (${res.status})`, true);
          continue;
        }
        if (!res.ok) {
          const body = await res.text().catch(() => "");
          slot.release();
          // 5xx: transient, retry; 4xx: fail fast
          if (res.status >= 500) {
            lastError = new LLMError(`Groq ${res.status}: ${body.slice(0, 200)}`, true);
            await sleep(500 * (attempt + 1));
            continue;
          }
          throw new LLMError(`Groq ${res.status}: ${body.slice(0, 300)}`);
        }

        const data = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        slot.release();
        const content = data.choices?.[0]?.message?.content;
        if (!content) throw new LLMError("Groq returned an empty completion");
        this.onUsage?.({
          model: this.model,
          tag: req.tag,
          keyId: slot.id,
          promptTokens: data.usage?.prompt_tokens ?? 0,
          completionTokens: data.usage?.completion_tokens ?? 0,
        });
        return content;
      } catch (e) {
        if (e instanceof LLMError && !e.retryable) throw e;
        // network error: release slot and retry
        slot.release();
        lastError = e as Error;
        await sleep(400 * (attempt + 1));
      }
    }
    throw new LLMError(
      `Groq request failed after ${this.maxAttempts} attempts: ${lastError?.message ?? "unknown"}`,
    );
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
