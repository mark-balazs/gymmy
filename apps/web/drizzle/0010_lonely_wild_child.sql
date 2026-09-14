CREATE TABLE "group_members" (
	"group_id" text NOT NULL,
	"user_id" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "group_members_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "plan_events" (
	"id" text PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"plan_id" text,
	"plan_name" text,
	"group_id" text,
	"group_name" text,
	"detail" jsonb
);
--> statement-breakpoint
CREATE TABLE "plan_shares" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"target_user_id" text,
	"group_id" text,
	"shared_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "plan_slots" (
	"id" text PRIMARY KEY NOT NULL,
	"plan_id" text NOT NULL,
	"session_index" integer NOT NULL,
	"position" integer NOT NULL,
	"key" text,
	"name" text NOT NULL,
	"required_role" text DEFAULT 'Any' NOT NULL,
	"pattern_keys" jsonb,
	"day_key" text,
	"exercise_name" text,
	"sets" integer DEFAULT 3 NOT NULL,
	"rep_range" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"days" integer DEFAULT 3 NOT NULL,
	"where" text DEFAULT 'gym' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "plan_id" text;--> statement-breakpoint
ALTER TABLE "profiles" ADD COLUMN "plan_version" integer;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'athlete' NOT NULL;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_user_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."user_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_events" ADD CONSTRAINT "plan_events_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_events" ADD CONSTRAINT "plan_events_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_events" ADD CONSTRAINT "plan_events_group_id_user_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."user_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_shares" ADD CONSTRAINT "plan_shares_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_shares" ADD CONSTRAINT "plan_shares_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_shares" ADD CONSTRAINT "plan_shares_group_id_user_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."user_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_slots" ADD CONSTRAINT "plan_slots_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_groups" ADD CONSTRAINT "user_groups_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "group_members_user" ON "group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "plan_events_plan" ON "plan_events" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "plan_events_at" ON "plan_events" USING btree ("at");--> statement-breakpoint
CREATE INDEX "plan_shares_plan" ON "plan_shares" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "plan_shares_user" ON "plan_shares" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "plan_shares_group" ON "plan_shares" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_slots_pos" ON "plan_slots" USING btree ("plan_id","session_index","position");--> statement-breakpoint
CREATE INDEX "plans_owner" ON "plans" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "user_groups_owner" ON "user_groups" USING btree ("owner_id");