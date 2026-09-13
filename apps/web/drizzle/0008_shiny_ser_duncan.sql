CREATE TABLE "body_logs" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"seq" bigint NOT NULL,
	"date" text NOT NULL,
	"weight" double precision NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "body_logs_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "height_cm" integer;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "sex" text DEFAULT 'unspecified' NOT NULL;--> statement-breakpoint
ALTER TABLE "body_logs" ADD CONSTRAINT "body_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bodylogs_seq" ON "body_logs" USING btree ("user_id","seq");