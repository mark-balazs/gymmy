ALTER TABLE "exercises" ADD COLUMN "description" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "exercises" ADD COLUMN "images" jsonb DEFAULT '[]'::jsonb NOT NULL;