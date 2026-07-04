CREATE TYPE "public"."job_application_role" AS ENUM('referee', 'coach', 'staff');--> statement-breakpoint
CREATE TABLE "job_applications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"brand" varchar(30) DEFAULT 'aspire' NOT NULL,
	"role" "job_application_role" NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"email" varchar(320) NOT NULL,
	"phone" varchar(30),
	"preferred_location" varchar(30),
	"certifications" text,
	"experience" text NOT NULL,
	"availability" text[] DEFAULT '{}' NOT NULL,
	"resume_key" text,
	"source" varchar(200),
	"status" varchar(30) DEFAULT 'new' NOT NULL,
	"notion_page_id" varchar(64),
	"notion_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_applications" ADD CONSTRAINT "job_applications_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;