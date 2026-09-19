ALTER TABLE "profiles" ADD COLUMN "entry_mode" text DEFAULT 'buttons' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "plate_loader" boolean DEFAULT true NOT NULL;