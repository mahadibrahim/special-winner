CREATE TABLE "futsal_interest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid,
	"email" text NOT NULL,
	"email_canonical" text NOT NULL,
	"source" text DEFAULT 'rent_page' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "futsal_interest_email_canonical_unique" UNIQUE("email_canonical")
);
--> statement-breakpoint
ALTER TABLE "futsal_interest" ADD CONSTRAINT "futsal_interest_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "futsal_interest_created_idx" ON "futsal_interest" USING btree ("created_at");