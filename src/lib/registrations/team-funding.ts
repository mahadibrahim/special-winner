import { and, eq, inArray, isNotNull, ne, or } from "drizzle-orm";
import type { getDb } from "@/lib/db";
import {
  teamInvitees,
  teamRegistrationMembers,
  teamRegistrations,
} from "@/lib/db/schema";
import { teamCollectedCents } from "@/lib/registrations/captain-credit";

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

export interface TeamBlock {
  id: string;
  teamName: string;
  teamFeeCents: number | null;
  depositCents: number;
  collectedCents: number;
  role: string;
}

/**
 * Team financial context for registrations that belong to a team
 * registration. A team member's own row is $0/$0 when the captain's deposit
 * covers it, which reads as a free registration in admin (#525) — so admin
 * surfaces attach the team's money state (fee, deposit, collected so far,
 * via the canonical `teamCollectedCents`) to every member row.
 */
export async function teamBlocksByRegistrationId(
  db: ReturnType<typeof getDb>,
  registrationIds: string[],
): Promise<Map<string, TeamBlock>> {
  const result = new Map<string, TeamBlock>();
  if (registrationIds.length === 0) return result;

  const memberships = await db
    .select({
      registrationId: teamRegistrationMembers.registrationId,
      role: teamRegistrationMembers.role,
      team: teamRegistrations,
    })
    .from(teamRegistrationMembers)
    .innerJoin(
      teamRegistrations,
      eq(teamRegistrationMembers.teamRegistrationId, teamRegistrations.id),
    )
    .where(inArray(teamRegistrationMembers.registrationId, registrationIds));
  if (memberships.length === 0) return result;

  const teamIds = [...new Set(memberships.map((m) => m.team.id))];
  const invitees = await db
    .select({
      teamRegistrationId: teamInvitees.teamRegistrationId,
      email: teamInvitees.email,
      assignedShareCents: teamInvitees.assignedShareCents,
      status: teamInvitees.status,
    })
    .from(teamInvitees)
    .where(inArray(teamInvitees.teamRegistrationId, teamIds));

  const inviteesByTeam = new Map<string, typeof invitees>();
  for (const inv of invitees) {
    const list = inviteesByTeam.get(inv.teamRegistrationId) ?? [];
    list.push(inv);
    inviteesByTeam.set(inv.teamRegistrationId, list);
  }

  for (const { registrationId, role, team } of memberships) {
    const depositCents = team.depositCents ?? 0;
    const captainEmailLower = team.captainEmail.toLowerCase();
    const collectedCents = teamCollectedCents({
      depositCents,
      invitees: (inviteesByTeam.get(team.id) ?? []).map((i) => ({
        assignedShareCents: i.assignedShareCents,
        status: i.status,
        isCaptain: i.email.toLowerCase() === captainEmailLower,
      })),
    });
    result.set(registrationId, {
      id: team.id,
      teamName: team.teamName,
      teamFeeCents: team.teamFeeCents ?? null,
      depositCents,
      collectedCents,
      role,
    });
  }
  return result;
}
