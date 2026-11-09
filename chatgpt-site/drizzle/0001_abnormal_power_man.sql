CREATE TABLE `delivery_jobs` (
	`key` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`account_id` text NOT NULL,
	`stage` text NOT NULL,
	`data` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `generation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`input` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`result` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `login_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`reset_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `materials` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`size` integer NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`pathname` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `materials_pathname_unique` ON `materials` (`pathname`);--> statement-breakpoint
CREATE TABLE `oauth_pending` (
	`state` text PRIMARY KEY NOT NULL,
	`platform` text NOT NULL,
	`verifier` text NOT NULL,
	`expires` integer NOT NULL,
	`browser_hash` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `social_accounts` (
	`platform` text PRIMARY KEY NOT NULL,
	`account_id` text NOT NULL,
	`name` text NOT NULL,
	`credentials` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
ALTER TABLE `posts` ADD `publish_options` text DEFAULT '{}' NOT NULL;