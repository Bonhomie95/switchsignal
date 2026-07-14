# SwitchSignal

Competitor intelligence, opportunity scouting & win-over engine — a 2-in-1 tool:

- **Compete mode** — describe your product (markdown, landing-page URL, repo, or store listing). SwitchSignal profiles it, discovers competitors, mines their public reviews/community complaints, classifies each one (payer likelihood, switch intent, fit with *your* product), and produces:
  - **Build Radar** — a Gap Report (complaints you don't solve → build next), Ammo Report (complaints you do solve → marketing angles), and an 8-week complaint trend chart
  - **Win-Over Leads** — high-intent unhappy competitor customers, each with a drafted reply that **you** review, approve, and post yourself. Nothing sends automatically.
  - **Competitor pricing tracker** — snapshots competitors' public pricing on every refresh and surfaces plan/price changes
- **Scout mode** — scan any category for high-revenue / low-overhead software with unhappy paying customers, ranked by an evidence-backed Opportunity Score. One click adopts an opportunity into Compete mode with the pipeline pre-seeded.
- **Runs itself** — optional scheduled re-crawls (6h–48h, set in Settings), weekly digest on the Overview, cancellable jobs (live over SSE), CSV export of leads and reports.

### Advanced intelligence

- **Token management** — every LLM call's usage is recorded; a daily token budget (Settings) throttles pipelines so a big crawl can never exhaust the free Groq tier. Live usage/quota panel with per-task breakdown.
- **Two-pass classification** — a cheap triage call filters non-complaints before the full scoring prompt runs, roughly halving token burn on noisy sources.
- **Semantic feature clustering** — complaints are embedded locally (MiniLM via transformers.js, $0) and clustered so "team sso" and "sso / team management" count as one feature in the Gap Report. Falls back to string clustering if the model can't load.
- **Full-text search** (SQLite FTS5) over all complaints.
- **Feedback flywheel** — your approved messages become few-shot style examples for future drafts; drafts A/B-rotate concise/warm/direct styles and the Leads page shows reply-rate per style.
- **Author-level lead merging** — one lead per person, best complaint wins, score boosted by repeats; nobody is ever contacted twice.
- **Incident spikes** — z-score alerts when a competitor's complaints jump (their bad release = your window).
- **Ship-and-resurface** — mark a Gap feature shipped and everyone who asked for it becomes a "we built it" lead.
- **Reply tracking** — after you mark a lead sent, threads are polled to auto-advance sent → replied.
- **Scout hardening** — revenue-evidence URLs are fetched and verified (unverifiable claims downgraded); opportunities dedupe across scans with rising/falling trend.
- **Resilient crawling** — per-source incremental cursors and circuit breakers; connector-health panel in Settings.

See [PRD.md](PRD.md) for the full product spec.

## Quick start

```bash
npm install
npm run seed      # optional: demo data so every page has content
npm run dev       # http://localhost:3000
```

Works with **zero API keys** out of the box (deterministic mock LLM so you can exercise the whole flow). For real intelligence, add keys in **Settings**:

| Key | Where | What it unlocks |
|---|---|---|
| Groq (add several!) | console.groq.com (free) | Real profiling, classification, drafts. Multiple keys form a **concurrent pool** — throughput scales with key count, 429s rotate automatically |
| Brave Search | brave.com/search/api (free ~2k/mo) | Evidence-backed competitor discovery & Scout scans |
| Reddit script app | reddit.com/prefs/apps (free) | The highest-intent complaint source |
| Anthropic | console.anthropic.com | The upgrade path — switch provider in Settings, no code changes |

Env vars also work: `GROQ_API_KEYS` (comma-separated), `BRAVE_API_KEY`, `ANTHROPIC_API_KEY`, `REDDIT_CLIENT_ID`/`REDDIT_CLIENT_SECRET`, `GITHUB_TOKEN`.

## Commands

```bash
npm run dev                # dev server
npm run build && npm start # production
npm test                   # 52 unit tests (key pool, scoring, simhash dedup, CSV, matching, connectors)
npm run seed               # seed demo dataset
npm run smoke:connectors   # live smoke test against real public APIs
npm run db:generate        # regenerate drizzle migrations after schema changes
```

## Architecture

```
Next.js 15 (App Router) ── API routes ── in-process job runner (SQLite-persisted)
        │                                     │
   dashboard UI                    pipeline: profile → discover →
        │                          mine → classify → leads
   SQLite (drizzle)  ◄── LLM adapter (Groq key-pool │ Anthropic │ mock)
        │                          │
        └── connectors: Reddit (OAuth), HN Algolia, App Store RSS,
            Play Store, Trustpilot, GitHub issues, Brave search
```

Key design points:

- **`src/lib/llm/keypool.ts`** — multi-key concurrent pool: per-key in-flight limits, least-loaded selection, 429 cooldowns, auto-disable on 401.
- **`src/lib/llm/`** — provider-agnostic `complete()`/`completeJSON()`; swapping Groq → Anthropic is a Settings toggle.
- **`src/lib/connectors/`** — one module per source; a failing source adds a warning, never kills a run. Word-boundary mention matching and store-name similarity thresholds keep wrong-app reviews out of the data. (Trustpilot is blocked by Cloudflare on some networks and degrades to a warning; G2 has no free access and is intentionally not scraped.)
- **`src/lib/analysis/simhash.ts`** — near-duplicate detection folds cross-posts and copy-pasted reviews before they burn LLM quota or double-count in reports.
- **Quota guard** — classification is capped per run (`CLASSIFY_MAX_PER_RUN`, default 150) and ordered by source signal, so a big crawl can never exhaust the free Groq tier in one shot; the rest trickles into later runs.
- **`src/lib/jobs/`** — persistent jobs with live progress, cooperative cancel, and an auto-refresh scheduler (started via `instrumentation.ts`); survives restarts by failing orphans cleanly.
- **Compliance by design** — no email scraping, public-channel-first outreach, human approval on every message, suppression via lead status.

## Data

Everything lives in `data/switchsignal.db` (SQLite, WAL). Delete the file to reset. Keys never leave your machine except to call the provider itself.
