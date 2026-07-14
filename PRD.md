# SwitchSignal — Competitor Intelligence, Opportunity Scouting & Win-Over Engine

**Working title:** SwitchSignal (rename freely)
**Status:** Draft v0.2 — product requirements
**Owner:** Babatunde Joseph Adeyemi
**Last updated:** 2026-07-11

---

## 1. One-liner

A **2-in-1 market intelligence engine** for any software product:

- **Compete Mode** — you already have (or are building) an app: describe it, and the system finds your competitors, mines their public reviews and community chatter for unhappy customers — prioritizing paying ones — and produces a ranked feature-gap report plus a human-approved outreach pipeline for winning switchers over.
- **Scout Mode** — you don't have an app yet: the system scans the market for **high-revenue, low-expense software** with lots of paying-but-unsatisfied customers, and ranks them as build opportunities. Pick one, build it, then flip straight into Compete Mode with a ready-made list of people to win over.

The two modes are one loop: **Scout finds what to build → you build it → Compete tells you what to improve and who to convert.**

## 2. Problem statement

The fastest path to paying users is not cold advertising — it's finding people who are **already paying for a product and already unhappy**, then either showing them yours fixes their exact complaint or building the missing feature first. And the fastest path to a *profitable product idea* is finding software that already makes good money with low operating cost but a frustrated paying user base. Today both kinds of research are manual: reading G2 reviews, scrolling Reddit, browsing Indie Hackers revenue posts. It's slow, unsystematic, and nobody closes the loop back into a roadmap or an outreach list.

## 3. Target user

- Primary: solo developers / small teams — both those with a shipped product (Compete Mode) and those hunting for what to build next (Scout Mode).
- Works for **any** software category: SaaS, mobile apps, browser extensions, dev tools, desktop apps.

## 4. Mode A — Compete (you have a product)

```
Input → Profile → Discover competitors → Mine complaints → Analyze → Split:
                                                       ├── Build Radar (roadmap intel)
                                                       └── Win-Over Pipeline (outreach)
```

### 4.1 Product Profiling (input)

The user describes their product via any of:

| Input type | What we extract |
|---|---|
| Markdown / plain-text description | Value prop, feature list, category, pricing model |
| Product URL (landing page) | Same, scraped + LLM-summarized |
| README / repo URL | Feature set inferred from docs |
| App Store / Play Store / Chrome Web Store listing | Category, keywords, metadata |
| Guided form (fallback) | Manual entry: category, features, differentiators, pricing |

Output: a structured **Product Profile** (JSON): category, feature taxonomy, target persona, pricing tier, key differentiators. The user reviews and edits the profile before anything runs — garbage in, garbage out.

### 4.2 Competitor Discovery

Given the Product Profile, automatically discover competitors from:

- Web search ("best X tools", "X alternatives", comparison articles)
- G2 / Capterra / Product Hunt category pages
- App store "similar apps"
- AlternativeTo listings
- GitHub topic/star adjacency (for dev tools)

Output: a **Competitor Set** — per competitor: name, URL, pricing tiers, claimed features, market position. User can add/remove manually.

### 4.3 Complaint Mining

For each competitor, continuously collect public dissatisfaction signals:

| Source | Signal quality | Payer signal? | Cost |
|---|---|---|---|
| G2 / Capterra / TrustRadius reviews | High (structured, star-rated) | Yes — plan/company size stated | Free (scrape within ToS) |
| App Store / Play Store reviews | High volume | Sometimes ("paid for premium and…") | Free (RSS/public endpoints) |
| Trustpilot | Medium | Sometimes | Free |
| Reddit (niche subs, r/SaaS) | High intent ("alternative to X?") | Often stated | Free API tier |
| Hacker News | High quality for dev tools | Rarely | Free (Algolia API) |
| Competitor's public GitHub issues | Very high (feature requests, bugs) | N/A | Free API |
| Public community/Discourse forums | High | Often | Free |
| X/Twitter | Real-time | Sometimes | **Paid API — deferred to later phase** |

Each item becomes a **Complaint Record**: source, permalink, date, verbatim text, author handle (public), competitor, plus the extraction fields below.

### 4.4 Analysis (LLM pipeline)

Each Complaint Record is classified into:

1. **Complaint category** — pricing, missing feature, bug/reliability, UX, support, performance, privacy, lock-in.
2. **Specific feature/issue named** — normalized against a shared feature taxonomy.
3. **Payer likelihood score** (0–1) — mentions of paying, plan names, "canceling my subscription", team size.
4. **Switch intent score** (0–1) — "looking for alternatives" scores high; mild grumbling scores low.
5. **Fit score** (0–1) — does *your* product (per its Profile) solve this complaint today?
6. Sentiment + severity.

### 4.5 Build Radar (developer-facing output)

- **Gap Report:** complaints your product does NOT solve, ranked by `frequency × payer likelihood × switch intent` — your build-next list, priced by real demand.
- **Ammo Report:** complaints your product DOES solve — marketing angles, ranked the same way.
- **Trend lines:** complaint categories per competitor over time.
- **Competitor pricing tracker:** diffs when a competitor changes plans.
- **Alerts:** "12 new high-intent complaints about {Competitor}'s {feature} this week."

### 4.6 Win-Over Pipeline (outreach)

Leads = Complaint Records with high `switch intent × payer likelihood × fit`. Human-in-the-loop by design (see §6):

1. **Lead queue** — verbatim complaint, source link, scores, your matching feature.
2. **Channel-appropriate draft** — the LLM drafts a response *where the complaint lives*: Reddit/HN/forum reply, X reply, or (only when contact info was publicly volunteered in a "contact me" context) an email.
3. **You approve, edit, or reject every message.** Nothing sends automatically.
4. **Suppression + dedupe** — never contact the same person twice; honor opt-outs permanently; per-platform rate limits.
5. **Tracking** — contacted → replied → trial → converted. CSV/webhook export later.

## 5. Mode B — Scout (find what to build)

The inverse flow: instead of starting from your product, start from the market.

```
Category/keyword (or "surprise me") → Harvest candidates → Estimate economics
→ Mine complaint volume → Opportunity Score → Ranked build list → [build it] → Compete Mode
```

### 5.1 Candidate harvesting — where revenue data actually exists

True revenue/expense figures for private software companies are not publicly available, so Scout Mode works from **verifiable and proxy signals**, clearly labeled as such in the UI:

| Source | What it gives | Reliability |
|---|---|---|
| Indie Hackers products | Self-reported (some Stripe-verified) MRR | Medium–High |
| Open-startup dashboards (companies publishing live revenue) | Real MRR | High |
| Acquire.com / marketplace listings | Asking price, stated revenue & profit | Medium |
| Starter Story / founder interviews | Stated revenue | Medium |
| G2/Capterra: review count × price tier | Revenue *proxy* | Low–Medium |
| App store: rating count × price / IAP presence | Revenue *proxy* | Low–Medium |
| ProductHunt traction + pricing page | Demand proxy | Low |

### 5.2 Expense/effort estimation (proxies)

"Low expenses" is estimated, not known — via: team size (site/LinkedIn "About" pages), infra complexity inferred from the product type (a CRUD SaaS vs. a video-processing platform), support load signals, and **solo-founder flags** (one-person products with real MRR are the strongest low-expense signal).

### 5.3 Opportunity Score

```
Opportunity = revenue signal
            × paying-customer volume
            × complaint volume & severity (unhappy payers = openable door)
            × build feasibility (inverse of estimated complexity)
            × competition thinness (few strong alternatives)
```

Output: a **ranked build list**, each entry showing: the product, evidence links for its revenue claim, its top recurring complaints (mined via the same Stage-4.3/4.4 pipeline), estimated clone complexity, and a one-paragraph "why this is winnable" summary.

### 5.4 Hand-off to Compete Mode

Picking an opportunity does three things automatically:

1. Seeds a **Product Profile draft** (the target's features + the top complaints as your differentiators).
2. Seeds the **Competitor Set** (the target + its existing alternatives).
3. Preserves the already-mined complaint records — so the day you launch, your Win-Over lead queue is pre-populated.

## 6. Compliance & ethics (non-negotiable design constraints)

- **No email harvesting.** We never scrape or enrich personal email addresses from reviews/profiles. GDPR, CAN-SPAM, and platform ToS all prohibit it, and cold mail to scraped addresses blacklists your domain within weeks.
- **Public-channel-first outreach.** Replying where the complaint was posted is legal, welcome when genuinely helpful, and converts better ("saw you were having trouble with X — we built exactly this").
- **Human approves every outbound message.**
- **Respect robots.txt and official APIs** where they exist; scraping fallbacks stay within ToS.
- **Every message discloses who you are.** No astroturfing, no fake accounts.

Compliant win-over is a differentiator against grey-hat scrapers, not a limitation.

## 7. Cost strategy — near-zero budget until it earns its keep

Hard constraint: the system must run on **free tiers only** at first.

| Layer | Now (free) | Later (revenue-funded) |
|---|---|---|
| LLM | **Groq free tier** (Llama 3.3 70B — classification, scoring, email/reply drafting) | **Anthropic Claude** (Haiku for bulk classification, Sonnet/Opus for drafts & analysis) |
| Database | Supabase or Neon free Postgres (pgvector included) | Paid tier of same |
| Job queue | **pg-boss** (runs inside Postgres — no Redis to host) | BullMQ + managed Redis if scale demands |
| Hosting | Vercel free tier / run locally | Paid tier / VPS |
| Web search | Brave Search API free tier (~2k queries/mo) | SerpAPI or similar |
| Reddit | Free API tier | Same |
| HN | Algolia API (free, no key) | Same |
| X/Twitter | **Skipped** (API is paid) | Add when funded |
| Email sending | Resend free tier (100/day — far above human-approved volume) | Paid tier |

**Design consequence:** the LLM layer is a **provider-agnostic interface** (`complete(prompt, schema) → JSON`) from day one, so Groq → Anthropic is a config change, not a rewrite. Same for the search provider. Rate-limit-aware batching everywhere, since free tiers are quota-bound.

If productized, the same logic becomes the pricing model: free tier (1 product, weekly refresh, Groq-backed) → paid tier (multiple products, daily refresh, alerts, Claude-backed drafts).

## 8. Feature list (consolidated)

**MVP (phase 1)**
- [ ] LLM provider abstraction (Groq first; Anthropic-ready)
- [ ] Compete: product profiling from MD/URL/text, with edit step
- [ ] Compete: competitor discovery (web search + manual add)
- [ ] Complaint mining: Reddit + one review source + HN (shared by both modes)
- [ ] Classification pipeline (category, payer, intent, fit scores)
- [ ] Gap Report + Ammo Report dashboard
- [ ] Lead queue with draft-reply + manual approve/send (Reddit first)

**Phase 2**
- [ ] **Scout Mode v1:** Indie Hackers + Acquire.com + open-startup harvesting, Opportunity Score, ranked build list
- [ ] Scout → Compete hand-off (profile/competitor/lead seeding)
- [ ] Scheduled re-crawls + weekly digest; high-intent spike alerts
- [ ] More sources: app stores, Trustpilot, GitHub issues
- [ ] Outreach funnel tracking (contacted → trial → converted)
- [ ] Competitor pricing/changelog tracker

**Phase 3**
- [ ] Swap draft-generation to Anthropic (config change); keep Groq for bulk classification if cost-effective
- [ ] Scout: revenue-proxy models for G2/app-store data; competition-thinness scoring
- [ ] Multi-product workspaces, team seats, CRM export
- [ ] Ship-and-resurface: when you build a gap feature, resurface old leads who complained about it
- [ ] X/Twitter connector (paid API)

## 9. Architecture sketch

```
┌────────────┐   ┌──────────────┐   ┌──────────────┐   ┌────────────┐
│  Next.js   │──▶│  API (Node/  │──▶│  pg-boss      │──▶│ Connectors  │
│  dashboard │   │  TS)         │   │  job queue    │   │ (per source)│
└────────────┘   └──────┬───────┘   └──────┬───────┘   └─────┬──────┘
                        │                  │                 │
                 ┌──────▼───────┐   ┌──────▼────────┐   ┌────▼───────┐
                 │  Postgres     │   │ LLM adapter   │   │ External    │
                 │  (+pgvector)  │◀──│ Groq│Anthropic│   │ APIs/scrape │
                 └──────────────┘   └───────────────┘   └────────────┘
```

- **Connectors** are isolated per source (reddit.ts, appstore.ts, g2.ts, indiehackers.ts…) — a broken scraper never takes the pipeline down; new sources are additive. Both modes share the complaint-mining connectors.
- **LLM adapter:** one interface, pluggable providers (Groq now, Anthropic later), structured-output enforcement, per-provider rate limiting.
- **Embeddings** (pgvector) for complaint dedup and clustering — use a free local model (e.g., via `transformers.js`) to stay at $0.
- **Auth/billing** (only if productized): Clerk + Stripe.

## 10. Success metrics

- Compete: ≥1 roadmap decision/month traced to the Gap Report; reply rate >15% on approved public outreach; trials attributed.
- Scout: ≥3 credible, evidence-backed opportunities per scan; revenue-signal spot-check accuracy ≥80%.
- System: classification precision ≥90% on spot-checks; $0 infra spend through MVP.

## 11. Open questions

1. First category to point Scout Mode at for the dogfood run? (Determines which harvesting connectors to build first.)
2. Groq free-tier daily quota is the real MVP bottleneck — cap crawl volume per product, or queue-and-trickle classification over days?
3. Dashboard from day one, or CLI/markdown-report first and add the web UI in phase 2? (CLI-first ships weeks earlier at $0.)
