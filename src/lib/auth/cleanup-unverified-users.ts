/**
 * Daily TTL sweep for unverified users.
 *
 * Bots can complete signup but never click the verification email, so we
 * end up with orphaned accounts that pollute the users table and (more
 * importantly) keep their email_canonical slot reserved — which would
 * eventually let a real person be locked out of their own address.
 *
 * Safeguards before deletion:
 *  1. email_verified = false
 *  2. created_at < NOW() - 7 days (so a slow human signup isn't culled)
 *  3. No rows in user_roles (any role assignment = real account, leave it)
 *  4. No rows in user_organization_access (same logic)
 *  5. No family_members rows referencing them (self_user_id or
 *     parent_user_id) — those indicate at least one registration attempt
 *  6. No drop_in_bookings or field_rentals rows — guest drop-in checkout
 *     creates unverified users WITH bookings; those are real customers
 *
 * Beyond the explicit guards, deletion is per-user with FK-violation
 * tolerance: many tables reference users without a cascade, and a single
 * referenced user inside one bulk DELETE used to abort the entire sweep
 * (nobody got cleaned). A blocking reference from ANY table means the
 * account has activity somewhere — skip it and keep sweeping.
 *
 * Cascades handle sessions, email_verification_tokens, and other
 * onDelete: "cascade" foreign keys automatically.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

const SEVEN_DAYS_INTERVAL = "7 days";

/** Postgres error code for foreign_key_violation. */
const FK_VIOLATION = "23503";

export type CleanupUnverifiedUsersResult = {
  deleted: number;
  /** Candidates skipped because a non-cascade FK still references them. */
  skipped: number;
};

function isFkViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === FK_VIOLATION || e?.cause?.code === FK_VIOLATION;
}

export async function cleanupUnverifiedUsers(): Promise<CleanupUnverifiedUsersResult> {
  const db = getDb();

  const candidates = await db.execute(sql`
    SELECT u.id FROM users u
    WHERE u.email_verified = false
      AND u.created_at < NOW() - INTERVAL '${sql.raw(SEVEN_DAYS_INTERVAL)}'
      AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id)
      AND NOT EXISTS (
        SELECT 1 FROM user_organization_access uoa WHERE uoa.user_id = u.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM family_members fm
        WHERE fm.self_user_id = u.id OR fm.parent_user_id = u.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM drop_in_bookings dib WHERE dib.user_id = u.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM field_rentals fr WHERE fr.renter_user_id = u.id
      )
  `);

  const rows = (candidates as unknown as { rows?: Array<{ id: string }> })
    .rows ?? (candidates as unknown as Array<{ id: string }>);

  let deleted = 0;
  let skipped = 0;
  for (const row of rows) {
    try {
      await db.execute(sql`DELETE FROM users WHERE id = ${row.id}`);
      deleted++;
    } catch (err) {
      if (isFkViolation(err)) {
        // Referenced from some activity table without a cascade — real
        // account by definition. Leave it; don't fail the sweep.
        skipped++;
        continue;
      }
      throw err;
    }
  }

  if (skipped > 0) {
    console.warn(
      `[cleanup-unverified-users] skipped ${skipped} candidate(s) still ` +
        "referenced by non-cascade FKs (counted as activity)",
    );
  }

  return { deleted, skipped };
}
