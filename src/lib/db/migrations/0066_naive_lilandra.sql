CREATE TABLE "coach_onboarding_progress" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"organization_id" uuid NOT NULL,
	"task_key" varchar(50) NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_onboarding_progress" ADD CONSTRAINT "coach_onboarding_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_onboarding_progress" ADD CONSTRAINT "coach_onboarding_progress_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coach_onboarding_progress_user_org_task_uniq" ON "coach_onboarding_progress" USING btree ("user_id","organization_id","task_key");--> statement-breakpoint
CREATE INDEX "coach_onboarding_progress_org_idx" ON "coach_onboarding_progress" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "coach_onboarding_progress_user_idx" ON "coach_onboarding_progress" USING btree ("user_id");