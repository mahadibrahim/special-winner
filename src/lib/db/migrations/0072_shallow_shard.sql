-- Idempotent type/table statements (0023/0024/0063/0065/0070/0071
-- convention): tolerate a drifted DB that already carries the
-- type/table/constraint.
DO $$ BEGIN CREATE TYPE "public"."payroll_export_kind" AS ENUM('hours', 'referee_fees'); EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "payroll_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"kind" "payroll_export_kind" NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"row_count" integer DEFAULT 0 NOT NULL,
	"exported_by_user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_exports" ADD CONSTRAINT "payroll_exports_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "payroll_exports" ADD CONSTRAINT "payroll_exports_exported_by_user_id_users_id_fk" FOREIGN KEY ("exported_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payroll_exports_org_idx" ON "payroll_exports" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "payroll_exports_exported_by_idx" ON "payroll_exports" USING btree ("exported_by_user_id");
