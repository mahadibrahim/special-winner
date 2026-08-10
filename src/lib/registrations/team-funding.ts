import { and, eq, inArray, isNotNull, ne, or } from "drizzle-orm";
import type { getDb } from "@/lib/db";
import {
  teamRegistrationMembers,
  teamRegistrations,
} from "@/lib/db/schema";

export interface TeamFundingInfo {
  teamRegistrationId: string;
  teamName: string;
}

/**
 * Which of these registrations are TEAM-FUNDED — i.e. belong to a team
 * registration whose deposit is verifiably paid (SQL twin of
 * `teamDepositPaid` in captain-credit.ts: backstopStatus moved off "none"
 * or depositPaymentId recorded).
 *
 * Such a registration's spot is paid for by the captain's deposit/backstop
 * even when its own amountPaidCents is 0 and it has no payments row, so
 * money-sensitive flows (refund #528, delete guards #529) must treat it as
 * having money on file.
 */
export async function teamFundedRegistrations(
  db: ReturnType<typeof getDb>,
  registrationIds: string[],
): Promise<Map<string, TeamFundingInfo>> {
  const result = new Map<string, TeamFundingInfo>();
  if (registrationIds.length === 0) return result;

  const rows = await db
    .select({
      registrationId: teamRegistrationMembers.registrationId,
      teamRegistrationId: teamRegistrations.id,
      teamName: teamRegistrations.teamName,
    })
    .from(teamRegistrationMembers)
    .innerJoin(
      teamRegistrations,
      eq(teamRegistrationMembers.teamRegistrationId, teamRegistrations.id),
    )
    .where(
      and(
        inArray(teamRegistrationMembers.registrationId, registrationIds),
        or(
          ne(teamRegistrations.backstopStatus, "none"),
          isNotNull(teamRegistrations.depositPaymentId),
        ),
      ),
    );

  for (const row of rows) {
    result.set(row.registrationId, {
      teamRegistrationId: row.teamRegistrationId,
      teamName: row.teamName,
    });
  }
  return result;
}
