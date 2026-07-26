-- idempotent: 'failed' may already exist on staging (added under an earlier
-- migration number before this branch was rebased onto main). IF NOT EXISTS
-- makes re-application a no-op on staging while still adding it on prod.
ALTER TYPE "public"."payment_status" ADD VALUE IF NOT EXISTS 'failed' BEFORE 'partial_refund';