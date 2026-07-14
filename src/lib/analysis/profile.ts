import { completeJSON } from "@/lib/llm";
import { fetchPageText } from "@/lib/connectors";
import { type ProductProfile, ProductProfileSchema } from "./schemas";

const SYSTEM = `You are a precise product analyst. You extract structured product profiles from raw material. Respond with ONLY a JSON object of this exact shape:
{"name": string, "category": string, "description": string (2-3 sentences), "features": string[] (5-12 short lowercase feature phrases), "persona": string, "pricing": string, "differentiators": string[]}
Never invent features that are not implied by the material. If pricing is unknown, write "unknown".`;

/**
 * Build a ProductProfile from whatever the user gave us.
 * For url/repo/store inputs we fetch the page text first.
 */
export async function buildProductProfile(
  inputType: "markdown" | "url" | "repo" | "store" | "form",
  rawInput: string,
): Promise<ProductProfile> {
  let material = rawInput;
  if (inputType === "url" || inputType === "repo" || inputType === "store") {
    try {
      const text = await fetchPageText(rawInput.trim());
      material = `Source URL: ${rawInput}\n\nPage content:\n${text}`;
    } catch (e) {
      material = `Source URL: ${rawInput} (fetch failed: ${(e as Error).message}). Profile from the URL itself and general knowledge; be conservative.`;
    }
  }
  return completeJSON(
    {
      tag: "profile",
      system: SYSTEM,
      prompt: `Extract the product profile from this material:\n\n${material.slice(0, 14_000)}`,
      temperature: 0.1,
    },
    ProductProfileSchema,
  );
}
