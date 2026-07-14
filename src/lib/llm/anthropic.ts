import { LLMError, type LLMProvider, type LLMRequest } from "./types";

const API_URL = "https://api.anthropic.com/v1/messages";
export const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

/**
 * Anthropic provider — the planned upgrade path once the project is funded.
 * Same interface as Groq, so switching is a Settings change.
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";

  constructor(
    private readonly apiKey: string,
    private readonly model: string = process.env.ANTHROPIC_MODEL ??
      DEFAULT_ANTHROPIC_MODEL,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly onUsage?: (u: {
      model: string;
      tag: string;
      keyId: string | number;
      promptTokens: number;
      completionTokens: number;
    }) => void,
  ) {}

  async complete(req: LLMRequest): Promise<string> {
    const res = await this.fetchFn(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: req.maxTokens ?? 2048,
        temperature: req.temperature ?? 0.2,
        ...(req.system ? { system: req.system } : {}),
        messages: [{ role: "user", content: req.prompt }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new LLMError(
        `Anthropic ${res.status}: ${body.slice(0, 300)}`,
        res.status === 429 || res.status >= 500,
      );
    }
    const data = (await res.json()) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = data.content
      ?.filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (!text) throw new LLMError("Anthropic returned an empty completion");
    this.onUsage?.({
      model: this.model,
      tag: req.tag,
      keyId: "anthropic",
      promptTokens: data.usage?.input_tokens ?? 0,
      completionTokens: data.usage?.output_tokens ?? 0,
    });
    return text;
  }
}
