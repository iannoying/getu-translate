CREATE TABLE `quota_period` (
	`user_id` text NOT NULL,
	`bucket` text NOT NULL,
	`period_key` text NOT NULL,
	`used` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (CAST(unixepoch('now','subsec') * 1000 AS INTEGER)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quota_period_pk` ON `quota_period` (`user_id`,`bucket`,`period_key`);--> statement-breakpoint
CREATE TABLE `usage_log` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`bucket` text NOT NULL,
	`amount` integer NOT NULL,
	`request_id` text NOT NULL,
	`upstream_model` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('now','subsec') * 1000 AS INTEGER)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `usage_log_user_request_uidx` ON `usage_log` (`user_id`,`request_id`);--> statement-breakpoint
CREATE INDEX `usage_log_user_bucket_idx` ON `usage_log` (`user_id`,`bucket`,`created_at`);--> statement-breakpoint
CREATE TABLE `user_entitlements` (
	`user_id` text PRIMARY KEY NOT NULL,
	`tier` text DEFAULT 'free' NOT NULL,
	`features` text DEFAULT '[]' NOT NULL,
	`expires_at` integer,
	`stripe_customer_id` text,
	`stripe_subscription_id` text,
	`grace_until` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('now','subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_at` integer DEFAULT (CAST(unixepoch('now','subsec') * 1000 AS INTEGER)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
