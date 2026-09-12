ALTER TABLE "profiles" ADD COLUMN "split" text DEFAULT 'sevenPattern' NOT NULL;--> statement-breakpoint
ALTER TABLE "slots" ADD COLUMN "session_index" integer;--> statement-breakpoint
ALTER TABLE "slots" ADD COLUMN "pattern_keys" jsonb;--> statement-breakpoint
ALTER TABLE "slots" ADD COLUMN "day_key" text;