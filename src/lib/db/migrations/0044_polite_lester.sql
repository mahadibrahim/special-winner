ALTER TYPE "public"."season_status" ADD VALUE IF NOT EXISTS 'forming' BEFORE 'open';--> statement-breakpoint
CREATE TABLE "season_interest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" uuid NOT NULL,
	"organization_id" uuid,
	"email" varchar(320) NOT NULL,
	"first_name" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "season_interest" ADD CONSTRAINT "season_interest_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_interest" ADD CONSTRAINT "season_interest_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "season_interest_season_idx" ON "season_interest" USING btree ("season_id");--> statement-breakpoint
CREATE UNIQUE INDEX "season_interest_season_email_uniq" ON "season_interest" USING btree ("season_id",lower("email"));