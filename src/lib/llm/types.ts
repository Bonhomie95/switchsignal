/** Tags let the mock provider produce task-appropriate output, and let us
 * route cheap vs. smart models per task later. */
export type LLMTag =
  | "profile"
  | "discover"
  | "triage"
  | "classify"
  | "draft"
  | "scout"
  | "generic";

export interface LLMRequest {
  tag: LLMTag;
  system?: string;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  /** hint that the response must be a single JSON value */
  json?: boolean;
}

export interface LLMProvider {
  readonly name: string;
  complete(req: LLMRequest): Promise<string>;
}

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean = false,
  ) {
    super(message);
    this.name = "LLMError";
  }
}
