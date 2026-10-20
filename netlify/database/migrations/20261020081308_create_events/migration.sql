CREATE TABLE "events" (
	"id" serial PRIMARY KEY,
	"type" text NOT NULL,
	"path" text,
	"detail" text,
	"visitor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "events_created_at_idx" ON "events" ("created_at");--> statement-breakpoint
CREATE INDEX "events_type_created_at_idx" ON "events" ("type","created_at");