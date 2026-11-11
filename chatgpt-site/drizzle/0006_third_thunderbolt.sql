CREATE TABLE `account_automation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lease_id` text,
	`lease_until` text,
	`output_material_id` text,
	`spec` text,
	`provenance` text,
	`post_id` text,
	`publish_until` text,
	`external_id` text,
	`external_url` text,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `account_automation_due` ON `account_automation_jobs` (`status`,`scheduled_at`,`lease_until`);--> statement-breakpoint
CREATE UNIQUE INDEX `account_automation_slot` ON `account_automation_jobs` (`account_id`,`scheduled_at`);--> statement-breakpoint
CREATE TABLE `account_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`scheduled_at` text NOT NULL,
	`status` text DEFAULT 'blocked' NOT NULL,
	`output_material_id` text,
	`error` text,
	FOREIGN KEY (`account_id`) REFERENCES `accounts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_runs_slot` ON `account_runs` (`account_id`,`scheduled_at`);--> statement-breakpoint
CREATE TABLE `account_social_credentials` (
	`workspace_account_id` text NOT NULL,
	`platform` text NOT NULL,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`credentials` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`platform`, `workspace_account_id`)
);
--> statement-breakpoint
CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `oauth_pending` ADD `workspace_account_id` text;--> statement-breakpoint
ALTER TABLE `social_accounts` ADD `workspace_account_id` text DEFAULT '' NOT NULL;