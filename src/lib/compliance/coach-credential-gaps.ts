import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { coachCredentials, users } from "@/lib/db/schema";
import {
  requiredCredentialGaps,
  type CredentialGap,
} from "./coach-credentials";

export interface CoachComplianceWarning {
  userId: string;
  coachName: string;
  gaps: CredentialGap[];
}

/**
 * Soft-gate helper for team coach assignment: one warning per assigned coach
 * missing (or expired on) any REQUIRED credential. Non-blocking by design —
 * callers attach the result to a successful response, never turn it into a
 * 4xx (Phase 1 decision: don't strand ops during rollout).
 *
 * Credential visibility matches the grid: org-scoped rows plus NULL-org
 * globals.
 */
export async function getCoachCredentialGapWarnings(
  organizationId: string,
  userIds: string[],
): Promise<CoachComplianceWarning[]> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return [];
  const db = getDb();

  const userRows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
    })
    .from(users)
    .where(inArray(users.id, ids));

  const credRows = await db
    .select()
    .from(coachCredentials)
    .where(
      and(
        inArray(coachCredentials.userId, ids),
        or(
          eq(coachCredentials.organizationId, organizationId),
          isNull(coachCredentials.organizationId),
        ),
      ),
    );

  const now = new Date();
  return userRows
    .map((u) => ({
      userId: u.id,
      coachName:
        `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || "This coach",
      gaps: requiredCredentialGaps(
        credRows.filter((r) => r.userId === u.id),
        now,
      ),
    }))
    .filter((w) => w.gaps.length > 0);
}
