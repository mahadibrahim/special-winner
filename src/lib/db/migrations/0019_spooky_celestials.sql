CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid,
	"name" varchar(255) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"description" text,
	"category" varchar(50),
	"audience" varchar(20),
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp,
	"venue_label" varchar(255),
	"registration_url" text,
	"price_cents" integer,
	"capacity" integer,
	"active" boolean DEFAULT true NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"image_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "events_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;