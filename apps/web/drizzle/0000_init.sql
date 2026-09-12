CREATE TABLE "account" (
	"userId" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"providerAccountId" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_providerAccountId_pk" PRIMARY KEY("provider","providerAccountId")
);
--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"seq" bigint NOT NULL,
	"name" text NOT NULL,
	"pattern_id" text NOT NULL,
	"where" text DEFAULT 'gym' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "exercises_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "patterns" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"seq" bigint NOT NULL,
	"key" text,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"counts" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "patterns_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"seq" bigint NOT NULL,
	"onboarded" boolean DEFAULT false NOT NULL,
	"days" integer DEFAULT 3 NOT NULL,
	"where" text DEFAULT 'gym' NOT NULL,
	"bias" text DEFAULT 'none' NOT NULL,
	"block_start" text NOT NULL,
	"block_weeks" integer DEFAULT 8 NOT NULL,
	"unit" text DEFAULT 'kg' NOT NULL,
	"lang" text DEFAULT 'en' NOT NULL,
	CONSTRAINT "profiles_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "program_entries" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"seq" bigint NOT NULL,
	"session_index" integer NOT NULL,
	"slot_id" text NOT NULL,
	"exercise_id" text,
	"sets" integer DEFAULT 3 NOT NULL,
	"rep_range" text DEFAULT '' NOT NULL,
	"start_weight" double precision,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "program_entries_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "ref_sets" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"seq" bigint NOT NULL,
	"date" text NOT NULL,
	"exercise_id" text NOT NULL,
	"weight" double precision,
	"reps" integer,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "ref_sets_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sessionToken" text PRIMARY KEY NOT NULL,
	"userId" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "set_logs" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"seq" bigint NOT NULL,
	"date" text NOT NULL,
	"session" text NOT NULL,
	"exercise_id" text NOT NULL,
	"set_no" integer DEFAULT 1 NOT NULL,
	"weight" double precision,
	"reps" integer,
	"rir" integer,
	"note" text DEFAULT '' NOT NULL,
	CONSTRAINT "set_logs_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "slots" (
	"id" text NOT NULL,
	"user_id" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"seq" bigint NOT NULL,
	"key" text,
	"name" text NOT NULL,
	"required_role" text DEFAULT 'Any' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "slots_user_id_id_pk" PRIMARY KEY("user_id","id")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"email" text,
	"emailVerified" timestamp,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verificationToken" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verificationToken_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patterns" ADD CONSTRAINT "patterns_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "program_entries" ADD CONSTRAINT "program_entries_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ref_sets" ADD CONSTRAINT "ref_sets_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_logs" ADD CONSTRAINT "set_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "slots" ADD CONSTRAINT "slots_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exercises_seq" ON "exercises" USING btree ("user_id","seq");--> statement-breakpoint
CREATE INDEX "patterns_seq" ON "patterns" USING btree ("user_id","seq");--> statement-breakpoint
CREATE INDEX "profiles_seq" ON "profiles" USING btree ("user_id","seq");--> statement-breakpoint
CREATE INDEX "entries_seq" ON "program_entries" USING btree ("user_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "entries_slot" ON "program_entries" USING btree ("user_id","session_index","slot_id");--> statement-breakpoint
CREATE INDEX "refsets_seq" ON "ref_sets" USING btree ("user_id","seq");--> statement-breakpoint
CREATE INDEX "logs_seq" ON "set_logs" USING btree ("user_id","seq");--> statement-breakpoint
CREATE INDEX "logs_date" ON "set_logs" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "slots_seq" ON "slots" USING btree ("user_id","seq");