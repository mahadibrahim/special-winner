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
 *
 * Cascades handle sessions, email_verification_tokens, and other
 * onDelete: "cascade" foreign keys automatically.
 */
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

const SEVEN_DAYS_INTERVAL = "7 days";

export type CleanupUnverifiedUsersResult = {
  deleted: number;
};

export async function cleanupUnverifiedUsers(): Promise<CleanupUnverifiedUsersResult> {
  const db = getDb();

  const result = await db.execute(sql`
    DELETE FROM users u
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
  `);

  // pg driver returns rowCount on the result object for DELETE statements.
  const deleted =
    (result as unknown as { rowCount?: number }).rowCount ?? 0;
  return { deleted };
}
