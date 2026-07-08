-- Idempotent (0023/0024/0044/0063/0065/0070/0071/0072 convention): tolerate
-- a drifted DB that already carries the enum value / column. drizzle-kit
-- emits a bare `ADD VALUE` / `ADD COLUMN` here — hand-edited per the 0044/
-- 0070 convention (ADD VALUE IF NOT EXISTS) and the 0023/0024 convention
-- (ADD COLUMN IF NOT EXISTS).
ALTER TYPE "public"."labor_flag_reason" ADD VALUE IF NOT EXISTS 'imprecise_location';--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "clock_in_accuracy_m" integer;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "clock_out_accuracy_m" integer;
