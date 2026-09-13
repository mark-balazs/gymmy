ALTER TABLE "profiles" ADD COLUMN "name" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "birth_year" integer;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "avatar" text;