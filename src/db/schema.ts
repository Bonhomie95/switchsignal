import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const now = () => sql`(unixepoch() * 1000)`;

/** Generic key/value settings (active LLM provider, defaults, etc.) */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull().default(now()),
});

/** API keys — multiple keys per provider; the Groq pool rotates across them. */
export const apiKeys = sqliteTable(
  "api_keys",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    provider: text("provider", {
      enum: ["groq", "anthropic", "brave"],
    }).notNull(),
    key: text("key").notNull(),
    label: text("label").notNull().default(""),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    requestCount: integer("request_count").notNull().default(0),
    /** unix ms until which this key is cooling down after a 429 */
    cooldownUntil: integer("cooldown_until").notNull().default(0),
    lastUsedAt: integer("last_used_at").notNull().default(0),
    createdAt: integer("created_at").notNull().default(now()),
  },
  (t) => [index("api_keys_provider_idx").on(t.provider)],
);

/** Per-request LLM usage, for token budgeting and cost visibility. */
export const llmUsage = sqliteTable(
  "llm_usage",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    provider: text("provider").notNull(),
    model: text("model").notNull().default(""),
    tag: text("tag").notNull().default("generic"),
    keyId: text("key_id").notNull().default(""),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    createdAt: integer("created_at").notNull().default(now()),
  },
  (t) => [index("llm_usage_created_idx").on(t.createdAt)],
);

/** Canonical feature clusters built from local embeddings. */
export const featureClusters = sqliteTable(
  "feature_clusters",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    /** JSON Float32 centroid */
    centroidJson: text("centroid_json").notNull(),
    memberCount: integer("member_count").notNull().default(1),
    createdAt: integer("created_at").notNull().default(now()),
  },
  (t) => [index("feature_clusters_product_idx").on(t.productId)],
);

/** Gap-report features the user has shipped (drives resurface + gap filtering). */
export const shippedFeatures = sqliteTable(
  "shipped_features",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    feature: text("feature").notNull(),
    resurfacedLeads: integer("resurfaced_leads").notNull().default(0),
    shippedAt: integer("shipped_at").notNull().default(now()),
  },
  (t) => [uniqueIndex("shipped_features_idx").on(t.productId, t.feature)],
);

/** Per (competitor, source) crawl state: incremental cursor + circuit breaker. */
export const connectorState = sqliteTable(
  "connector_state",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    competitorId: integer("competitor_id")
      .notNull()
      .references(() => competitors.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    /** newest postedAt seen last run (ms) — items at/before this are skipped */
    cursorTs: integer("cursor_ts").notNull().default(0),
    consecutiveFailures: integer("consecutive_failures").notNull().default(0),
    /** circuit breaker: skip this source until this time */
    disabledUntil: integer("disabled_until").notNull().default(0),
    lastRunAt: integer("last_run_at").notNull().default(0),
    lastItemCount: integer("last_item_count").notNull().default(0),
    lastError: text("last_error").notNull().default(""),
  },
  (t) => [uniqueIndex("connector_state_idx").on(t.competitorId, t.source)],
);

/** A product the user is competing with (Compete mode root entity). */
export const products = sqliteTable("products", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  inputType: text("input_type", {
    enum: ["markdown", "url", "repo", "store", "form"],
  }).notNull(),
  rawInput: text("raw_input").notNull().default(""),
  /** ProductProfile JSON: category, features[], persona, pricing, differentiators[] */
  profileJson: text("profile_json"),
  status: text("status", {
    enum: ["profiling", "profiled", "scanning", "ready", "error"],
  })
    .notNull()
    .default("profiling"),
  createdAt: integer("created_at").notNull().default(now()),
  updatedAt: integer("updated_at").notNull().default(now()),
});

export const competitors = sqliteTable(
  "competitors",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    url: text("url").notNull().default(""),
    summary: text("summary").notNull().default(""),
    /** JSON: [{plan, price, period}] */
    pricingJson: text("pricing_json"),
    /** JSON: string[] */
    featuresJson: text("features_json"),
    source: text("source", { enum: ["auto", "manual", "scout"] })
      .notNull()
      .default("auto"),
    status: text("status", { enum: ["active", "ignored"] })
      .notNull()
      .default("active"),
    createdAt: integer("created_at").notNull().default(now()),
  },
  (t) => [index("competitors_product_idx").on(t.productId)],
);

export const complaints = sqliteTable(
  "complaints",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    competitorId: integer("competitor_id").references(() => competitors.id, {
      onDelete: "cascade",
    }),
    source: text("source", {
      enum: ["reddit", "hn", "appstore", "playstore", "github", "g2", "trustpilot", "web", "demo"],
    }).notNull(),
    sourceUrl: text("source_url").notNull().default(""),
    author: text("author").notNull().default(""),
    title: text("title").notNull().default(""),
    body: text("body").notNull(),
    postedAt: integer("posted_at"),
    /** sha256 of source+externalId/text for dedupe */
    hash: text("hash").notNull(),
    // --- classification output ---
    category: text("category", {
      enum: [
        "pricing",
        "missing_feature",
        "bug_reliability",
        "ux",
        "support",
        "performance",
        "privacy",
        "lock_in",
        "other",
        "not_a_complaint",
      ],
    }),
    feature: text("feature"),
    payerScore: real("payer_score"),
    intentScore: real("intent_score"),
    fitScore: real("fit_score"),
    sentiment: real("sentiment"),
    severity: real("severity"),
    classificationNote: text("classification_note"),
    status: text("status", { enum: ["raw", "classified", "skipped"] })
      .notNull()
      .default("raw"),
    /** 64-bit simhash of the body (hex) for near-duplicate detection */
    simhash: text("simhash"),
    /** set when this post is a near-duplicate of an earlier complaint */
    duplicateOf: integer("duplicate_of"),
    /** JSON Float32 embedding of the complaint (local MiniLM), for clustering */
    embeddingJson: text("embedding_json"),
    /** canonical feature cluster (feature_clusters.id) */
    clusterId: integer("cluster_id"),
    createdAt: integer("created_at").notNull().default(now()),
  },
  (t) => [
    uniqueIndex("complaints_hash_idx").on(t.productId, t.hash),
    index("complaints_product_idx").on(t.productId),
    index("complaints_competitor_idx").on(t.competitorId),
  ],
);

export const leads = sqliteTable(
  "leads",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    productId: integer("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    complaintId: integer("complaint_id")
      .notNull()
      .references(() => complaints.id, { onDelete: "cascade" }),
    channel: text("channel", {
      enum: ["reddit", "hn", "forum", "x", "email", "other"],
    }).notNull(),
    score: real("score").notNull().default(0),
    draft: text("draft").notNull().default(""),
    finalMessage: text("final_message").notNull().default(""),
    /** A/B draft style used, for reply-rate analytics */
    styleVariant: text("style_variant", {
      enum: ["concise", "warm", "direct", "resurface"],
    }),
    /** how many complaints from this author were folded into this lead */
    mergedComplaints: integer("merged_complaints").notNull().default(1),
    status: text("status", {
      enum: [
        "new",
        "drafted",
        "approved",
        "rejected",
        "sent",
        "replied",
        "trial",
        "converted",
      ],
    })
      .notNull()
      .default("new"),
    notes: text("notes").notNull().default(""),
    sentAt: integer("sent_at"),
    createdAt: integer("created_at").notNull().default(now()),
    updatedAt: integer("updated_at").notNull().default(now()),
  },
  (t) => [
    index("leads_product_idx").on(t.productId),
    uniqueIndex("leads_complaint_idx").on(t.complaintId),
  ],
);

/** Periodic snapshots of a competitor's public pricing, for change tracking. */
export const pricingSnapshots = sqliteTable(
  "pricing_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    competitorId: integer("competitor_id")
      .notNull()
      .references(() => competitors.id, { onDelete: "cascade" }),
    /** JSON: [{plan, price, period}] as extracted from the page */
    pricingJson: text("pricing_json").notNull().default("[]"),
    /** hash of the extracted pricing, to detect changes cheaply */
    pricingHash: text("pricing_hash").notNull(),
    /** human-readable diff vs. the previous snapshot ("" for the first) */
    changeSummary: text("change_summary").notNull().default(""),
    createdAt: integer("created_at").notNull().default(now()),
  },
  (t) => [index("pricing_snapshots_competitor_idx").on(t.competitorId)],
);

/** Scout mode: one scan run over a category/keyword. */
export const scoutScans = sqliteTable("scout_scans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  query: text("query").notNull(),
  status: text("status", {
    enum: ["queued", "running", "completed", "failed"],
  })
    .notNull()
    .default("queued"),
  resultCount: integer("result_count").notNull().default(0),
  error: text("error"),
  createdAt: integer("created_at").notNull().default(now()),
});

export const opportunities = sqliteTable(
  "opportunities",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    scanId: integer("scan_id").references(() => scoutScans.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    url: text("url").notNull().default(""),
    category: text("category").notNull().default(""),
    summary: text("summary").notNull().default(""),
    /** 0–1 signals */
    revenueSignal: real("revenue_signal").notNull().default(0),
    payerVolume: real("payer_volume").notNull().default(0),
    complaintVolume: real("complaint_volume").notNull().default(0),
    feasibility: real("feasibility").notNull().default(0),
    competitionThinness: real("competition_thinness").notNull().default(0),
    opportunityScore: real("opportunity_score").notNull().default(0),
    /** score from the previous scan that found this same product (cross-scan memory) */
    previousScore: real("previous_score"),
    /** how many scans have found this product */
    timesSeen: integer("times_seen").notNull().default(1),
    /** JSON: [{claim, url, source, reliability, verified?}] */
    revenueEvidenceJson: text("revenue_evidence_json"),
    /** JSON: [{text, source, url}] */
    topComplaintsJson: text("top_complaints_json"),
    whyWinnable: text("why_winnable").notNull().default(""),
    status: text("status", {
      enum: ["candidate", "shortlisted", "dismissed", "adopted"],
    })
      .notNull()
      .default("candidate"),
    /** set after hand-off to Compete mode */
    productId: integer("product_id").references(() => products.id, {
      onDelete: "set null",
    }),
    createdAt: integer("created_at").notNull().default(now()),
  },
  (t) => [index("opportunities_scan_idx").on(t.scanId)],
);

/** Persistent job records so the dashboard can show pipeline progress. */
export const jobs = sqliteTable(
  "jobs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type", {
      enum: [
        "profile_product",
        "discover_competitors",
        "mine_complaints",
        "classify_complaints",
        "reclassify_skipped",
        "generate_leads",
        "refresh_data",
        "track_replies",
        "scout_scan",
        "full_pipeline",
      ],
    }).notNull(),
    payloadJson: text("payload_json").notNull().default("{}"),
    status: text("status", {
      enum: ["queued", "running", "completed", "failed", "cancelled"],
    })
      .notNull()
      .default("queued"),
    progress: integer("progress").notNull().default(0),
    message: text("message").notNull().default(""),
    error: text("error"),
    productId: integer("product_id").references(() => products.id, {
      onDelete: "cascade",
    }),
    createdAt: integer("created_at").notNull().default(now()),
    startedAt: integer("started_at"),
    finishedAt: integer("finished_at"),
  },
  (t) => [
    index("jobs_status_idx").on(t.status),
    index("jobs_product_idx").on(t.productId),
  ],
);

export type PricingSnapshot = typeof pricingSnapshots.$inferSelect;
export type LlmUsage = typeof llmUsage.$inferSelect;
export type FeatureCluster = typeof featureClusters.$inferSelect;
export type ShippedFeature = typeof shippedFeatures.$inferSelect;
export type ConnectorState = typeof connectorState.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Competitor = typeof competitors.$inferSelect;
export type Complaint = typeof complaints.$inferSelect;
export type Lead = typeof leads.$inferSelect;
export type Opportunity = typeof opportunities.$inferSelect;
export type ScoutScan = typeof scoutScans.$inferSelect;
export type Job = typeof jobs.$inferSelect;
export type ApiKey = typeof apiKeys.$inferSelect;
