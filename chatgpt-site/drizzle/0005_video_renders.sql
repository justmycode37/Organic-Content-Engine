CREATE TABLE `video_renders` (
  `job_id` text PRIMARY KEY NOT NULL REFERENCES `generation_jobs`(`id`) ON DELETE CASCADE,
  `status` text DEFAULT 'queued' NOT NULL,
  `lease_id` text,
  `lease_until` text,
  `attempts` integer DEFAULT 0 NOT NULL,
  `repairs` integer DEFAULT 0 NOT NULL,
  `next_attempt_at` text NOT NULL,
  `output_material_id` text,
  `error_code` text,
  `error_message` text,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `video_renders_due` ON `video_renders` (`status`, `next_attempt_at`);
--> statement-breakpoint
CREATE UNIQUE INDEX `generation_video_post` ON `generation_jobs` (json_extract(`input`, '$.postId')) WHERE `kind`='video' AND json_extract(`input`, '$.postId') IS NOT NULL;
