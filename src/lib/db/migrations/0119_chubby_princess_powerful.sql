ALTER TYPE "public"."ops_ping_kind" ADD VALUE 'team_reserved' BEFORE 'dropin_booked';--> statement-breakpoint
ALTER TYPE "public"."ops_ping_kind" ADD VALUE 'team_backstop_charged' BEFORE 'dropin_booked';--> statement-breakpoint
ALTER TYPE "public"."ops_ping_kind" ADD VALUE 'team_backstop_failed' BEFORE 'dropin_booked';