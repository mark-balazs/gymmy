CREATE TABLE "goals" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"seq" bigint NOT NULL,
	"exercise_id" text NOT NULL,
	"target" double precision NOT NULL,
	"baseline" double precision NOT NULL,
	"started_on" text NOT NULL,
	"target_date" text NOT NULL,
	"retired_at" timestamp with time zone,
	CONSTRAINT "goals_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goals_seq" ON "goals" USING btree ("user_id","seq");