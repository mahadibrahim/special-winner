CREATE TABLE "admin_api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"scopes" varchar(50)[] NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"last_used_at" timestamp,
	"revoked_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "admin_api_tokens" ADD CONSTRAINT "admin_api_tokens_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_api_tokens" ADD CONSTRAINT "admin_api_tokens_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_api_tokens_hash_idx" ON "admin_api_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "admin_api_tokens_org_idx" ON "admin_api_tokens" USING btree ("organization_id");