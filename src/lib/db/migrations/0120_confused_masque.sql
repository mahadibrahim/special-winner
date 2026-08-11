CREATE TABLE "team_reservation_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"season_id" uuid NOT NULL,
	"captain_email" varchar(320) NOT NULL,
	"captain_name" varchar(200) NOT NULL,
	"team_name" varchar(200) NOT NULL,
	"brand" varchar(20),
	"stripe_payment_intent_id" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "team_reservation_attempts" ADD CONSTRAINT "team_reservation_attempts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_reservation_attempts" ADD CONSTRAINT "team_reservation_attempts_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "team_reservation_attempts_season_email_uniq" ON "team_reservation_attempts" USING btree ("season_id","captain_email");