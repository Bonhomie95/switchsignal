CREATE TABLE `pricing_snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`competitor_id` integer NOT NULL,
	`pricing_json` text DEFAULT '[]' NOT NULL,
	`pricing_hash` text NOT NULL,
	`change_summary` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`competitor_id`) REFERENCES `competitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pricing_snapshots_competitor_idx` ON `pricing_snapshots` (`competitor_id`);--> statement-breakpoint
ALTER TABLE `complaints` ADD `simhash` text;--> statement-breakpoint
ALTER TABLE `complaints` ADD `duplicate_of` integer;