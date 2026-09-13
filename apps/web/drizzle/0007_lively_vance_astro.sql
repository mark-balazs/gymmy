CREATE TABLE "sign_in_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"client" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sign_in_attempts_email" ON "sign_in_attempts" USING btree ("email","created_at");--> statement-breakpoint
CREATE INDEX "sign_in_attempts_client" ON "sign_in_attempts" USING btree ("client","created_at");