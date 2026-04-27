ALTER TABLE `translation_jobs` ADD `error_code` text;--> statement-breakpoint
ALTER TABLE `translation_jobs` ADD `failed_at` integer;--> statement-breakpoint
ALTER TABLE `translation_jobs` ADD `retried_count` integer DEFAULT 0 NOT NULL;