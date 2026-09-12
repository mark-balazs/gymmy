CREATE TABLE "split_periods" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"seq" bigint NOT NULL,
	"split" text NOT NULL,
	"days" integer DEFAULT 3 NOT NULL,
	"start_week" text NOT NULL,
	"pattern_keys" jsonb NOT NULL,
	CONSTRAINT "split_periods_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
ALTER TABLE "split_periods" ADD CONSTRAINT "split_periods_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "split_periods_seq" ON "split_periods" USING btree ("user_id","seq");--> statement-breakpoint
CREATE INDEX "split_periods_start" ON "split_periods" USING btree ("user_id","start_week");