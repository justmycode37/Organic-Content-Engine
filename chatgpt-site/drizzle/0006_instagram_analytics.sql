CREATE TABLE `instagram_insight_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`age_bucket` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`captured_at` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text,
	`lease_id` text,
	`lease_until` text,
	`raw_json` text,
	`metrics_json` text,
	`error_code` text,
	`error_message` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `instagram_snapshot_post_age` ON `instagram_insight_snapshots` (`post_id`,`age_bucket`);--> statement-breakpoint
CREATE INDEX `instagram_snapshots_due` ON `instagram_insight_snapshots` (`status`,`scheduled_at`,`next_attempt_at`);--> statement-breakpoint
ALTER TABLE `post_feedback` ADD `style` text;--> statement-breakpoint
ALTER TABLE `post_feedback` ADD `hook_variant` text;--> statement-breakpoint
ALTER TABLE `post_feedback` ADD `claims_ledger_file` text;