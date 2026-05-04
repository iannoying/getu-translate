ALTER TABLE `translation_jobs` ADD `progress_updated_at` integer;
--> statement-breakpoint
UPDATE `translation_jobs` SET `progress_updated_at` = `created_at` WHERE `progress_updated_at` IS NULL;
