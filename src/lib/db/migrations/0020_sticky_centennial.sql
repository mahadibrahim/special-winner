CREATE TABLE "corporate_inquiries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_name" varchar(255) NOT NULL,
	"contact_name" varchar(200) NOT NULL,
	"contact_email" varchar(320) NOT NULL,
	"contact_phone" varchar(30),
	"company_size" varchar(50),
	"estimated_teams" integer,
	"sport_interest" varchar(100),
	"preferred_location" varchar(100),
	"preferred_start" varchar(100),
	"notes" text,
	"status" varchar(30) DEFAULT 'new' NOT NULL,
	"internal_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sponsor_bars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"location_id" uuid,
	"name" varchar(255) NOT NULL,
	"slug" varchar(200) NOT NULL,
	"city" varchar(100),
	"state" varchar(50),
	"address_line1" varchar(255),
	"url" text,
	"description" text,
	"perk" text,
	"active" boolean DEFAULT true NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sponsor_bars_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "team_registration_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_registration_id" uuid NOT NULL,
	"registration_id" uuid NOT NULL,
	"role" varchar(20) DEFAULT 'member' NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_registrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"captain_user_id" uuid,
	"captain_email" varchar(320) NOT NULL,
	"captain_name" varchar(200) NOT NULL,
	"team_name" varchar(200) NOT NULL,
	"invite_token" varchar(64) NOT NULL,
	"notes" text,
	"status" varchar(30) DEFAULT 'forming' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "team_registrations_invite_token_unique" UNIQUE("invite_token")
);
--> statement-breakpoint
ALTER TABLE "sponsor_bars" ADD CONSTRAINT "sponsor_bars_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sponsor_bars" ADD CONSTRAINT "sponsor_bars_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_registration_members" ADD CONSTRAINT "team_registration_members_team_registration_id_team_registrations_id_fk" FOREIGN KEY ("team_registration_id") REFERENCES "public"."team_registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_registration_members" ADD CONSTRAINT "team_registration_members_registration_id_registrations_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."registrations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_registrations" ADD CONSTRAINT "team_registrations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_registrations" ADD CONSTRAINT "team_registrations_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_registrations" ADD CONSTRAINT "team_registrations_captain_user_id_users_id_fk" FOREIGN KEY ("captain_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;