import { and, eq, inArray, isNotNull, ne, not, or, sql } from "drizzle-orm";
import type { getDb } from "@/lib/db";
import {
  payments,
  registrations,
  teamRegistrationMembers,
  teamRegistrations,
} from "@/lib/db/schema";

export interface TeamMoneyReceived {
  /** Settled team-level payments: deposit + backstop balance, refunds subtract. */
  teamLevelCents: number;
  /** Sum of linked member registrations' amountPaidCents (already refund-adjusted). */
  memberCents: number;
  totalCents: number;
}

/**
 * Settled money toward a team's fee — the single source of truth for
 * "collected" and for the backstop shortfall ("one price, every payment
 * counts"). Two components, no double counting:
 *
 *  - team-level payment rows (registration_id NULL, team_registration_id
 *    set): the captain deposit and any backstop balance; refund-typed rows
 *    subtract.
 *  - linked member registrations' amountPaidCents: every player who paid
 *    through the team link (invited or not — the Casey case), already
 *    refund-adjusted by the refund flows.
 *
 * Invitee share rows are deliberately NOT an input — they are bookkeeping
 * for reminders and roster display, and captains skip them.
 */
export async function teamMoneyReceivedByTeamIds(
  db: ReturnType<typeof getDb>,
  teamRegistrationIds: string[],
): Promise<Map<string, TeamMoneyReceived>> {
  const result = new Map<string, TeamMoneyReceived>();
  if (teamRegistrationIds.length === 0) return result;
  for (const id of teamRegistrationIds) {
    result.set(id, { teamLevelCents: 0, memberCents: 0, totalCents: 0 });
  }

  const [teamLevelRows, memberRows] = await Promise.all([
    db
      .select({
        teamRegistrationId: payments.teamRegistrationId,
        cents: sql<number>`COALESCE(SUM(
          CASE WHEN ${payments.paymentType} = 'refund'
               THEN -${payments.amountCents}
               ELSE ${payments.amountCents} END), 0)::int`,
      })
      .from(payments)
      .where(
        and(
          inArray(payments.teamRegistrationId, teamRegistrationIds),
          eq(payments.status, "succeeded"),
        ),
      )
      .groupBy(payments.teamRegistrationId),
    db
      .select({
        teamRegistrationId: teamRegistrationMembers.teamRegistrationId,
        cents: sql<number>`COALESCE(SUM(${registrations.amountPaidCents}), 0)::int`,
      })
      .from(teamRegistrationMembers)
      .innerJoin(
        registrations,
        eq(teamRegistrationMembers.registrationId, registrations.id),
      )
      .where(inArray(teamRegistrationMembers.teamRegistrationId, teamRegistrationIds))
      .groupBy(teamRegistrationMembers.teamRegistrationId),
  ]);

  for (const row of teamLevelRows) {
    if (!row.teamRegistrationId) continue;
    const entry = result.get(row.teamRegistrationId)!;
    entry.teamLevelCents = row.cents;
  }
  for (const row of memberRows) {
    const entry = result.get(row.teamRegistrationId)!;
    entry.memberCents = row.cents;
  }
  for (const entry of result.values()) {
    entry.totalCents = entry.teamLevelCents + entry.memberCents;
  }
  return result;
}

/** Single-team convenience wrapper over teamMoneyReceivedByTeamIds. */
export async function teamMoneyReceivedCents(
  db: ReturnType<typeof getDb>,
  teamRegistrationId: string,
): Promise<TeamMoneyReceived> {
  const map = await teamMoneyReceivedByTeamIds(db, [teamRegistrationId]);
  return (
    map.get(teamRegistrationId) ?? {
      teamLevelCents: 0,
      memberCents: 0,
      totalCents: 0,
    }
  );
}

export interface TeamRosterCollected {
  /** Sum of linked member registrations' amountPaidCents (already refund-adjusted). */
  memberCents: number;
  /** Settled team-level payments EXCLUDING the deposit and its refund pair (see doc comment below). */
  teamLevelCents: number;
  totalCents: number;
}

/**
 * Money the ROSTER has paid toward the team fee — the shortfall/collection
 * input for the deposit-refund executor (`maybeRefundTeamDeposit` in
 * src/lib/payments/team-deposit-refund.ts), deliberately DIFFERENT from
 * `teamMoneyReceivedCents` above (the admin-display source of truth for
 * "money on file").
 *
 * teamMoneyReceivedCents counts the $200 captain deposit itself (netting any
 * refund of it) because it answers "how much money is on file for this team,
 * period." This helper answers a narrower question — "how much has the
 * ROSTER covered, independent of the captain's own refundable deposit?" — so
 * it EXCLUDES both the deposit payment row and any refund of it, as a
 * matched, symmetric pair:
 *
 *   - the deposit row itself: identified primarily by
 *     `payments.id = team.depositPaymentId` (the durable link stamped at
 *     finalize time — see finalize-team-deposit.ts), falling back to
 *     `paymentType = 'deposit'` for legacy rows that predate that column
 *     being populated.
 *   - its refund counterpart: `paymentType = 'refund' AND refundReason =
 *     'team_deposit_release'` — the tag the deposit-refund executor stamps
 *     on the row it inserts.
 *
 * HAZARD this guards against: if a deposit-refund row were left IN the sum
 * (netted like any other refund, the way teamMoneyReceivedCents treats it),
 * then ISSUING the refund would itself lower "roster collected" back down —
 * re-arming whatever shortfall/full-collection check fired the refund in the
 * first place. A cron re-run or a redelivered trigger could see the
 * post-refund total and decide the roster is newly short again, or newly
 * "fully collected" again, chasing its own tail. Excluding the deposit and
 * its refund symmetrically makes this figure monotonic in PARENT payments
 * only — a roster payment can only raise it, a deposit refund can never move
 * it — so the value that fed the refund decision stays stable after the
 * refund fires. Other refunds (e.g. an admin refund of a parent's own share)
 * are NOT exempted and still subtract, same as teamMoneyReceivedCents.
 */
export async function teamRosterCollectedByTeamIds(
  db: ReturnType<typeof getDb>,
  teamRegistrationIds: string[],
): Promise<Map<string, TeamRosterCollected>> {
  const result = new Map<string, TeamRosterCollected>();
  if (teamRegistrationIds.length === 0) return result;
  for (const id of teamRegistrationIds) {
    result.set(id, { teamLevelCents: 0, memberCents: 0, totalCents: 0 });
  }

  const [teamLevelRows, memberRows] = await Promise.all([
    db
      .select({
        teamRegistrationId: payments.teamRegistrationId,
        cents: sql<number>`COALESCE(SUM(
          CASE WHEN ${payments.paymentType} = 'refund'
               THEN -${payments.amountCents}
               ELSE ${payments.amountCents} END), 0)::int`,
      })
      .from(payments)
      .innerJoin(
        teamRegistrations,
        eq(payments.teamRegistrationId, teamRegistrations.id),
      )
      .where(
        and(
          inArray(payments.teamRegistrationId, teamRegistrationIds),
          eq(payments.status, "succeeded"),
          // Exclude the deposit row and its refund pair — see doc comment
          // above. Each disjunct is written to never evaluate to SQL NULL
          // (three-valued-logic trap): a bare `eq(col, nullableCol)` or
          // `eq(nullableCol, literal)` returns NULL, not false, when the
          // nullable side is null — which would silently drop the ROW from
          // the aggregate entirely (via NOT(NULL) = NULL in a WHERE clause)
          // instead of just failing to match the exclusion. Guarding each
          // disjunct with isNotNull first keeps every branch a definite
          // true/false.
          not(
            or(
              and(
                isNotNull(teamRegistrations.depositPaymentId),
                eq(payments.id, teamRegistrations.depositPaymentId),
              )!,
              eq(payments.paymentType, "deposit"),
              and(
                eq(payments.paymentType, "refund"),
                isNotNull(payments.refundReason),
                eq(payments.refundReason, "team_deposit_release"),
              )!,
            )!,
          ),
        ),
      )
      .groupBy(payments.teamRegistrationId),
    db
      .select({
        teamRegistrationId: teamRegistrationMembers.teamRegistrationId,
        cents: sql<number>`COALESCE(SUM(${registrations.amountPaidCents}), 0)::int`,
      })
      .from(teamRegistrationMembers)
      .innerJoin(
        registrations,
        eq(teamRegistrationMembers.registrationId, registrations.id),
      )
      .where(inArray(teamRegistrationMembers.teamRegistrationId, teamRegistrationIds))
      .groupBy(teamRegistrationMembers.teamRegistrationId),
  ]);

  for (const row of teamLevelRows) {
    if (!row.teamRegistrationId) continue;
    const entry = result.get(row.teamRegistrationId)!;
    entry.teamLevelCents = row.cents;
  }
  for (const row of memberRows) {
    const entry = result.get(row.teamRegistrationId)!;
    entry.memberCents = row.cents;
  }
  for (const entry of result.values()) {
    entry.totalCents = entry.teamLevelCents + entry.memberCents;
  }
  return result;
}

/** Single-team convenience wrapper over teamRosterCollectedByTeamIds. */
export async function teamRosterCollectedCents(
  db: ReturnType<typeof getDb>,
  teamRegistrationId: string,
): Promise<TeamRosterCollected> {
  const map = await teamRosterCollectedByTeamIds(db, [teamRegistrationId]);
  return (
    map.get(teamRegistrationId) ?? {
      teamLevelCents: 0,
      memberCents: 0,
      totalCents: 0,
    }
  );
}

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
 * surfaces attach the team's money state (fee, deposit, collected so far)
 * to every member row. Collected is money-based (`teamMoneyReceivedCents`):
 * every settled payment toward the team counts, invited or not.
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
  const received = await teamMoneyReceivedByTeamIds(db, teamIds);

  for (const { registrationId, role, team } of memberships) {
    result.set(registrationId, {
      id: team.id,
      teamName: team.teamName,
      teamFeeCents: team.teamFeeCents ?? null,
      depositCents: team.depositCents ?? 0,
      collectedCents: received.get(team.id)?.totalCents ?? 0,
      role,
    });
  }
  return result;
}
