import { hasSearchKey, webSearch } from "@/lib/connectors";
import { completeJSON } from "@/lib/llm";
import {
  type CompetitorSuggestions,
  CompetitorSuggestionsSchema,
  type ProductProfile,
} from "./schemas";

const SYSTEM = `You are a market research analyst. Given a product profile (and optionally web search results), identify its real, existing competitors. Only name products you are confident actually exist. Respond with ONLY JSON:
{"competitors": [{"name": string, "url": string (homepage, "" if unsure), "summary": string (1 sentence), "features": string[], "pricing": string}]}
Return 4-8 competitors, strongest/most popular first.`;

export async function discoverCompetitors(
  profile: ProductProfile,
): Promise<{ suggestions: CompetitorSuggestions; usedWebSearch: boolean }> {
  let searchContext = "";
  const usedWebSearch = hasSearchKey();
  if (usedWebSearch) {
    const queries = [
      `best ${profile.category} tools`,
      `${profile.name} alternatives`,
    ];
    const chunks: string[] = [];
    for (const q of queries) {
      const results = await webSearch(q, { count: 8 });
      chunks.push(
        ...results.map((r) => `- ${r.title} | ${r.url} | ${r.snippet}`),
      );
    }
    if (chunks.length)
      searchContext = `\n\nWeb search results for context:\n${chunks.join("\n").slice(0, 6000)}`;
  }

  const suggestions = await completeJSON(
    {
      tag: "discover",
      system: SYSTEM,
      prompt: `Product profile:\n${JSON.stringify(profile, null, 2)}${searchContext}\n\nList this product's competitors.`,
      temperature: 0.2,
    },
    CompetitorSuggestionsSchema,
  );
  return { suggestions, usedWebSearch };
}
