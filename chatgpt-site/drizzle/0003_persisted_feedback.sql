CREATE TABLE `post_feedback` (
  `post_id` text PRIMARY KEY NOT NULL REFERENCES `posts`(`id`) ON DELETE CASCADE,
  `format` text NOT NULL,
  `verdict` text CHECK (`verdict` IS NULL OR `verdict` IN ('successful','iterate','discard')),
  `notes` text DEFAULT '' NOT NULL,
  `impressions` integer,
  `engagements` integer,
  `conversions` integer,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `feedback_by_format` ON `post_feedback` (`format`);
