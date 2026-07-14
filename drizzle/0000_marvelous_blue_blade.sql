CREATE TABLE `api_keys` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`key` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`request_count` integer DEFAULT 0 NOT NULL,
	`cooldown_until` integer DEFAULT 0 NOT NULL,
	`last_used_at` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `api_keys_provider_idx` ON `api_keys` (`provider`);--> statement-breakpoint
CREATE TABLE `competitors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`name` text NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`pricing_json` text,
	`features_json` text,
	`source` text DEFAULT 'auto' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `competitors_product_idx` ON `competitors` (`product_id`);--> statement-breakpoint
CREATE TABLE `complaints` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`competitor_id` integer,
	`source` text NOT NULL,
	`source_url` text DEFAULT '' NOT NULL,
	`author` text DEFAULT '' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`body` text NOT NULL,
	`posted_at` integer,
	`hash` text NOT NULL,
	`category` text,
	`feature` text,
	`payer_score` real,
	`intent_score` real,
	`fit_score` real,
	`sentiment` real,
	`severity` real,
	`classification_note` text,
	`status` text DEFAULT 'raw' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`competitor_id`) REFERENCES `competitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `complaints_hash_idx` ON `complaints` (`product_id`,`hash`);--> statement-breakpoint
CREATE INDEX `complaints_product_idx` ON `complaints` (`product_id`);--> statement-breakpoint
CREATE INDEX `complaints_competitor_idx` ON `complaints` (`competitor_id`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`progress` integer DEFAULT 0 NOT NULL,
	`message` text DEFAULT '' NOT NULL,
	`error` text,
	`product_id` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `jobs_status_idx` ON `jobs` (`status`);--> statement-breakpoint
CREATE INDEX `jobs_product_idx` ON `jobs` (`product_id`);--> statement-breakpoint
CREATE TABLE `leads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer NOT NULL,
	`complaint_id` integer NOT NULL,
	`channel` text NOT NULL,
	`score` real DEFAULT 0 NOT NULL,
	`draft` text DEFAULT '' NOT NULL,
	`final_message` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`sent_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`complaint_id`) REFERENCES `complaints`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `leads_product_idx` ON `leads` (`product_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `leads_complaint_idx` ON `leads` (`complaint_id`);--> statement-breakpoint
CREATE TABLE `opportunities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scan_id` integer,
	`name` text NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`revenue_signal` real DEFAULT 0 NOT NULL,
	`payer_volume` real DEFAULT 0 NOT NULL,
	`complaint_volume` real DEFAULT 0 NOT NULL,
	`feasibility` real DEFAULT 0 NOT NULL,
	`competition_thinness` real DEFAULT 0 NOT NULL,
	`opportunity_score` real DEFAULT 0 NOT NULL,
	`revenue_evidence_json` text,
	`top_complaints_json` text,
	`why_winnable` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'candidate' NOT NULL,
	`product_id` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`scan_id`) REFERENCES `scout_scans`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `opportunities_scan_idx` ON `opportunities` (`scan_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`input_type` text NOT NULL,
	`raw_input` text DEFAULT '' NOT NULL,
	`profile_json` text,
	`status` text DEFAULT 'profiling' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scout_scans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`query` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`result_count` integer DEFAULT 0 NOT NULL,
	`error` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
