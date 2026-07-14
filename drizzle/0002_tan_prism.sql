CREATE TABLE `connector_state` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`competitor_id` integer NOT NULL,
	`source` text NOT NULL,
	`cursor_ts` integer DEFAULT 0 NOT NULL,
	`consecutive_failures` integer DEFAULT 0 NOT NULL,
	`disabled_until` integer DEFAULT 0 NOT NULL,
	`last_run_at` integer DEFAULT 0 NOT NULL,
	`last_item_count` integer DEFAULT 0 NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`competitor_id`) REFERENCES `competitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `connector_state_idx` ON `connector_state` (`competitor_id`,`source`);--> statement-breakpoint
CREATE TABLE `feature_clusters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`label` text NOT NULL,
	`centroid_json` text NOT NULL,
	`member_count` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `feature_clusters_product_idx` ON `feature_clusters` (`product_id`);--> statement-breakpoint
CREATE TABLE `llm_usage` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`tag` text DEFAULT 'generic' NOT NULL,
	`key_id` text DEFAULT '' NOT NULL,
	`prompt_tokens` integer DEFAULT 0 NOT NULL,
	`completion_tokens` integer DEFAULT 0 NOT NULL,
	`total_tokens` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `llm_usage_created_idx` ON `llm_usage` (`created_at`);--> statement-breakpoint
CREATE TABLE `shipped_features` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`feature` text NOT NULL,
	`resurfaced_leads` integer DEFAULT 0 NOT NULL,
	`shipped_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shipped_features_idx` ON `shipped_features` (`product_id`,`feature`);--> statement-breakpoint
ALTER TABLE `complaints` ADD `embedding_json` text;--> statement-breakpoint
ALTER TABLE `complaints` ADD `cluster_id` integer;--> statement-breakpoint
ALTER TABLE `leads` ADD `style_variant` text;--> statement-breakpoint
ALTER TABLE `leads` ADD `merged_complaints` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `opportunities` ADD `previous_score` real;--> statement-breakpoint
ALTER TABLE `opportunities` ADD `times_seen` integer DEFAULT 1 NOT NULL;