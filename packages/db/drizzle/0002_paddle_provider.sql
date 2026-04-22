-- rename legacy stripe columns to provider-agnostic names
ALTER TABLE user_entitlements RENAME COLUMN stripe_customer_id TO provider_customer_id;
--> statement-breakpoint
ALTER TABLE user_entitlements RENAME COLUMN stripe_subscription_id TO provider_subscription_id;
--> statement-breakpoint
ALTER TABLE user_entitlements ADD COLUMN billing_provider TEXT;
--> statement-breakpoint

-- webhook event idempotency + audit
CREATE TABLE billing_webhook_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  received_at INTEGER NOT NULL DEFAULT (CAST(unixepoch('now','subsec') * 1000 AS INTEGER)),
  processed_at INTEGER,
  status TEXT NOT NULL DEFAULT 'received',
  error_message TEXT,
  payload_json TEXT NOT NULL
);
--> statement-breakpoint
CREATE INDEX billing_webhook_events_received_at_idx ON billing_webhook_events (received_at);
