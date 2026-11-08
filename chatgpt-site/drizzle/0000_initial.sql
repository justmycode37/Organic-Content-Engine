CREATE TABLE `activity` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`level` text NOT NULL,
	`message` text NOT NULL,
	`post_id` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `brand` (
	`id` integer PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "brand_singleton" CHECK("brand"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `ideas` (
	`id` text PRIMARY KEY NOT NULL,
	`pillar_id` text NOT NULL,
	`title` text NOT NULL,
	`title_key` text NOT NULL,
	`angle` text NOT NULL,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`pillar_id`) REFERENCES `pillars`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ideas_by_pillar_status` ON `ideas` (`pillar_id`,`status`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `ideas_pillar_title` ON `ideas` (`pillar_id`,`title_key`);--> statement-breakpoint
CREATE TABLE `job_locks` (
	`name` text PRIMARY KEY NOT NULL,
	`locked_until` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `job_state` (
	`name` text PRIMARY KEY NOT NULL,
	`last_run_at` text,
	`last_result` text
);
--> statement-breakpoint
CREATE TABLE `pillars` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`audience` text NOT NULL,
	`tone` text NOT NULL,
	`keywords` text NOT NULL,
	`platforms` text NOT NULL,
	`active` integer NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`idea_id` text,
	`pillar_id` text,
	`platform` text NOT NULL,
	`body` text NOT NULL,
	`media_urls` text NOT NULL,
	`status` text NOT NULL,
	`origin` text NOT NULL,
	`generator` text,
	`scheduled_at` text,
	`published_at` text,
	`external_id` text,
	`external_url` text,
	`attempt_count` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text,
	`lease_at` text,
	`last_error_code` text,
	`last_error_message` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`idea_id`) REFERENCES `ideas`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`pillar_id`) REFERENCES `pillars`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `posts_due` ON `posts` (`status`,`scheduled_at`);--> statement-breakpoint
CREATE INDEX `posts_by_platform` ON `posts` (`platform`,`scheduled_at`);--> statement-breakpoint
CREATE TABLE `publish_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`attempt_number` integer NOT NULL,
	`mode` text NOT NULL,
	`route` text,
	`outcome` text NOT NULL,
	`code` text,
	`message` text,
	`external_id` text,
	`started_at` text NOT NULL,
	`finished_at` text NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attempts_by_post` ON `publish_attempts` (`post_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` text NOT NULL,
	CONSTRAINT "settings_singleton" CHECK("settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE `workspace_owner` (
	`id` integer PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	CONSTRAINT "workspace_owner_singleton" CHECK("workspace_owner"."id" = 1)
);
