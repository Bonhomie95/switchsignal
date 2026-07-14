/* Live smoke test: hits real public APIs (HN Algolia, Reddit JSON, iTunes,
 * GitHub) with a well-known product and prints counts + samples.
 * Run: npx tsx scripts/smoke-connectors.ts [competitorName] */
import { mineAppStore } from "../src/lib/connectors/appstore";
import { mineGithubIssues } from "../src/lib/connectors/github";
import { mineHN } from "../src/lib/connectors/hn";
import { mineReddit } from "../src/lib/connectors/reddit";

const name = process.argv[2] ?? "Notion";

async function main() {
  console.log(`Smoke-testing connectors for "${name}"\n`);

  const hn = await mineHN(name, { maxHits: 20 });
  report("HN", hn);

  const app = await mineAppStore(name, { pages: 1 });
  report("AppStore (≤3★)", app);

  const gh = await mineGithubIssues("https://github.com/microsoft/vscode", { max: 10 });
  report("GitHub (vscode issues)", gh);

  const reddit = await mineReddit(name, { maxPerQuery: 10 });
  report("Reddit", reddit);
}

function report(label: string, r: { items: unknown[]; warnings: string[] }) {
  console.log(`== ${label}: ${r.items.length} items, ${r.warnings.length} warnings`);
  for (const w of r.warnings) console.log(`   warn: ${w}`);
  const sample = r.items[0] as { title?: string; body?: string; url?: string } | undefined;
  if (sample)
    console.log(
      `   sample: ${(sample.title || sample.body || "").slice(0, 100).replace(/\n/g, " ")}\n   url: ${sample.url}`,
    );
  console.log();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
