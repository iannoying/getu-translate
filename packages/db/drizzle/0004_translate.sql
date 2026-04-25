CREATE TABLE `text_translations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source_text` text NOT NULL,
	`source_lang` text NOT NULL,
	`target_lang` text NOT NULL,
	`results` text NOT NULL,
	`created_at` integer DEFAULT (CAST(unixepoch('now','subsec') * 1000 AS INTEGER)) NOT NULL,
	`expires_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `text_translations_user_created_idx` ON `text_translations` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `text_translations_expires_idx` ON `text_translations` (`expires_at`);--> statement-breakpoint
CREATE TABLE `translation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source_key` text NOT NULL,
	`source_pages` integer NOT NULL,
	`source_filename` text,
	`source_bytes` integer,
	`output_html_key` text,
	`output_md_key` text,
	`model_id` text NOT NULL,
	`source_lang` text NOT NULL,
	`target_lang` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`engine` text DEFAULT 'simple' NOT NULL,
	`progress` text,
	`error_message` text,
	`created_at` integer DEFAULT (CAST(unixepoch('now','subsec') * 1000 AS INTEGER)) NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `translation_jobs_user_created_idx` ON `translation_jobs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `translation_jobs_status_idx` ON `translation_jobs` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `translation_jobs_expires_idx` ON `translation_jobs` (`expires_at`);
