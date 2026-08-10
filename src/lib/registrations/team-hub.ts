/**
 * Team Hub data builders (server-side, captain-scoped).
 *
 * Two "team" worlds meet here:
 *  - `team_registrations` — the captain's signup/payment entity (roster of
 *    invitees, shares, deposit). This is what the Team tab renders.
 *  - `teams` — the coach/roster/games/standings entity, created by an admin
 *    when the season is set up. This is what the Season tab renders.
 *
 * There is no direct FK between them. A reserved team's roster team is
 * derived through its members' registrations:
 *   team_registration_members → registrations → rosters → teams
 * Pre-season (no roster yet) that derivation is empty — which is exactly the
 * Season tab's honest empty state.
 *
 * Every function here is captain-scoped by the CALLER: the endpoints fetch the
 * team_registration row and verify `captainUserId === user.id` (and org) before
 * calling the detail builder. Never trust an id alone.
 */

import { and, asc, eq, inArray, ne } from "drizzle-orm";
import type { getDb } from "@/lib/db";
import {
  teamRegistrations,
  teamRegistrationMembers,
  teamInvitees,
  registrations,
  familyMembers,
  rosters,
  teams as teamsTable,
  games as gamesTable,
  venues as venuesTable,
  seasons,
  programs,
  sports,
  locations,
} from "@/lib/db/schema";
import {
  captainDepositCreditCents,
  captainShareDueCents,
  teamDepositPaid,
} from "@/lib/registrations/captain-credit";
import {
  teamMoneyReceivedCents,
  teamMoneyReceivedByTeamIds,
} from "@/lib/registrations/team-funding";
import { registrationAmountDueCents } from "@/lib/registrations/amount-due";
import {
  computeStandings,
  rulesForSport,
  type GameInput,
  type StandingRow,
} from "@/lib/leagues/standings";

type Db = ReturnType<typeof getDb>;

export interface CaptainTeamSummary {
  id: string;
  teamName: string;
  seasonName: string;
  seasonId: string;
  status: string;
  teamFeeCents: number | null;
  depositCents: number;
  collectedCents: number;
  /** Invitees still owing (pending — not paid, not charged-to-captain). */
  unpaidCount: number;
  inviteeCount: number;
  paymentDeadline: string | null;
  createdAt: string | null;
}

/**
 * Every team the user captains within the resolved org, with a live payment
 * summary. Scoped by both captainUserId and organizationId (tenant isolation).
 */
export async function listCaptainTeams(
  db: Db,
  userId: string,
  organizationId: string,
): Promise<CaptainTeamSummary[]> {
  const teamRows = await db
    .select({
      team: teamRegistrations,
      seasonName: seasons.name,
    })
    .from(teamRegistrations)
    .innerJoin(seasons, eq(teamRegistrations.seasonId, seasons.id))
    .where(
      and(
        eq(teamRegistrations.captainUserId, userId),
        eq(teamRegistrations.organizationId, organizationId),
        // A cancelled team isn't something the captain is still "running".
        ne(teamRegistrations.status, "cancelled"),
      ),
    )
    .orderBy(asc(teamRegistrations.createdAt));

  if (teamRows.length === 0) return [];

  const teamIds = teamRows.map((r) => r.team.id);
  // Invitees drive the unpaid count; collected is money-based
  // (teamMoneyReceivedByTeamIds) — settled payments, not share bookkeeping.
  const [allInvitees, receivedByTeam] = await Promise.all([
    db
      .select({
        teamRegistrationId: teamInvitees.teamRegistrationId,
        email: teamInvitees.email,
        assignedShareCents: teamInvitees.assignedShareCents,
        status: teamInvitees.status,
      })
      .from(teamInvitees)
      .where(inArray(teamInvitees.teamRegistrationId, teamIds)),
    teamMoneyReceivedByTeamIds(db, teamIds),
  ]);

  const inviteesByTeam = new Map<string, typeof allInvitees>();
  for (const inv of allInvitees) {
    const list = inviteesByTeam.get(inv.teamRegistrationId) ?? [];
    list.push(inv);
    inviteesByTeam.set(inv.teamRegistrationId, list);
  }

  return teamRows.map((r) => {
    const team = r.team;
    const invitees = inviteesByTeam.get(team.id) ?? [];
    const captainEmailLower = team.captainEmail.toLowerCase();
    const depositCents = team.depositCents ?? 0;
    const collectedCents = receivedByTeam.get(team.id)?.totalCents ?? 0;
    const unpaidCount = invitees.filter(
      (i) => i.status === "pending" && i.email.toLowerCase() !== captainEmailLower,
    ).length;
    return {
      id: team.id,
      teamName: team.teamName,
      seasonName: r.seasonName,
      seasonId: team.seasonId,
      status: team.status,
      teamFeeCents: team.teamFeeCents ?? null,
      depositCents,
      collectedCents,
      unpaidCount,
      inviteeCount: invitees.length,
      paymentDeadline: team.paymentDeadline
        ? team.paymentDeadline.toISOString()
        : null,
      createdAt: team.createdAt ? team.createdAt.toISOString() : null,
    };
  });
}

type TeamRegistrationRow = typeof teamRegistrations.$inferSelect;

export interface SeasonScheduleGame {
  id: string;
  scheduledAt: string;
  status: string;
  isHome: boolean;
  opponent: string;
  venue: string | null;
  teamScore: number | null;
  opponentScore: number | null;
}

export interface TeamHubDetail {
  team: {
    id: string;
    teamName: string;
    captainName: string;
    captainEmail: string;
    status: string;
    createdAt: string | null;
    inviteToken: string;
    members: Array<{
      firstName: string;
      lastInitial: string | null;
      role: string;
      registrationStatus: string;
      paymentStatus: string;
      waiverSigned: boolean;
    }>;
    invitees: Array<{
      id: string;
      email: string;
      assignedShareCents: number;
      status: string;
      invitedAt: string | null;
      paidAt: string | null;
    }>;
  };
  payment: {
    teamFeeCents: number | null;
    joinShareCents: number | null;
    depositCents: number;
    collectedCents: number;
    paymentDeadline: string | null;
  };
  captainCredit: {
    shareCents: number;
    creditCents: number;
    dueCents: number;
    depositCents: number;
  } | null;
  season: {
    id: string;
    name: string;
    slug: string;
    startDate: string | null;
    endDate: string | null;
    maxParticipants: number | null;
  };
  program: { id: string; name: string };
  sport: { id: string; name: string; slug: string };
  location: { id: string; name: string; slug: string };
  seasonModule: {
    /** The derived roster team (teams.id) once the season is set up. */
    rosterTeamId: string | null;
    rosterTeamName: string | null;
    schedule: SeasonScheduleGame[];
    standings: StandingRow[];
    /** teamId within `standings` to highlight (mirror of rosterTeamId). */
    highlightTeamId: string | null;
  };
}

/**
 * Full hub payload for one team registration. The caller MUST have already
 * verified the viewer is this team's captain (and same org).
 */
export async function buildTeamHubDetail(
  db: Db,
  team: TeamRegistrationRow,
): Promise<TeamHubDetail> {
  const context = await db
    .select({
      season: seasons,
      program: programs,
      sport: sports,
      location: locations,
    })
    .from(seasons)
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(sports, eq(programs.sportId, sports.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(eq(seasons.id, team.seasonId))
    .limit(1);

  const ctx = context[0]!;

  const [members, invitees] = await Promise.all([
    db
      .select({
        registrationId: teamRegistrationMembers.registrationId,
        role: teamRegistrationMembers.role,
        registrationStatus: registrations.status,
        paymentStatus: registrations.paymentStatus,
        waiverSigned: registrations.waiverSigned,
        firstName: familyMembers.firstName,
        lastName: familyMembers.lastName,
      })
      .from(teamRegistrationMembers)
      .innerJoin(
        registrations,
        eq(teamRegistrationMembers.registrationId, registrations.id),
      )
      .innerJoin(
        familyMembers,
        eq(registrations.familyMemberId, familyMembers.id),
      )
      .where(eq(teamRegistrationMembers.teamRegistrationId, team.id)),
    db
      .select({
        id: teamInvitees.id,
        email: teamInvitees.email,
        assignedShareCents: teamInvitees.assignedShareCents,
        status: teamInvitees.status,
        invitedAt: teamInvitees.invitedAt,
        paidAt: teamInvitees.paidAt,
      })
      .from(teamInvitees)
      .where(eq(teamInvitees.teamRegistrationId, team.id))
      .orderBy(asc(teamInvitees.invitedAt)),
  ]);

  const depositCents = team.depositCents ?? 0;
  const captainEmailLower = team.captainEmail.toLowerCase();
  // Money-based: settled team-level payments + linked member payments —
  // uninvited joiners count too (see teamMoneyReceivedCents).
  const collectedCents = (await teamMoneyReceivedCents(db, team.id)).totalCents;

  // Captain's own-registration credit preview (display-only; createRegistration
  // recomputes server-side). Only when the deposit is verifiably paid and the
  // captain hasn't already registered. Since #468/#469 the captain is
  // auto-registered as a member at finalize, so this is normally suppressed —
  // showing "you still owe $X for your own spot" to an already-registered
  // captain (whenever solo price > deposit) is just misleading.
  const captainRegistered = members.some((m) => m.role === "captain");
  let captainCredit: TeamHubDetail["captainCredit"] = null;
  if (teamDepositPaid(team) && !captainRegistered) {
    const ownInvitee = invitees.find(
      (i) => i.email.toLowerCase() === captainEmailLower,
    );
    if (!ownInvitee || ownInvitee.status !== "paid") {
      const shareCents = ownInvitee
        ? ownInvitee.assignedShareCents ?? 0
        : registrationAmountDueCents(ctx.season, "full");
      captainCredit = {
        shareCents,
        creditCents: captainDepositCreditCents(shareCents, depositCents),
        dueCents: captainShareDueCents(shareCents, depositCents),
        depositCents,
      };
    }
  }

  const seasonModule = await buildSeasonModule(db, team.id, ctx.sport.slug);

  return {
    team: {
      id: team.id,
      teamName: team.teamName,
      captainName: team.captainName,
      captainEmail: team.captainEmail,
      status: team.status,
      createdAt: team.createdAt ? team.createdAt.toISOString() : null,
      inviteToken: team.inviteToken,
      members: members.map((m) => ({
        firstName: m.firstName,
        lastInitial: m.lastName ? m.lastName[0]! : null,
        role: m.role,
        registrationStatus: m.registrationStatus,
        paymentStatus: m.paymentStatus,
        waiverSigned: m.waiverSigned,
      })),
      invitees: invitees.map((i) => ({
        id: i.id,
        email: i.email,
        assignedShareCents: i.assignedShareCents,
        status: i.status,
        invitedAt: i.invitedAt ? i.invitedAt.toISOString() : null,
        paidAt: i.paidAt ? i.paidAt.toISOString() : null,
      })),
    },
    payment: {
      teamFeeCents: team.teamFeeCents ?? null,
      joinShareCents: team.joinShareCents ?? null,
      depositCents,
      collectedCents,
      paymentDeadline: team.paymentDeadline
        ? team.paymentDeadline.toISOString()
        : null,
    },
    captainCredit,
    season: {
      id: ctx.season.id,
      name: ctx.season.name,
      slug: ctx.season.slug,
      // `date` columns come back as ISO date strings (not Date) from Drizzle.
      startDate: ctx.season.startDate ?? null,
      endDate: ctx.season.endDate ?? null,
      maxParticipants: ctx.season.maxParticipants,
    },
    program: { id: ctx.program.id, name: ctx.program.name },
    sport: { id: ctx.sport.id, name: ctx.sport.name, slug: ctx.sport.slug },
    location: { id: ctx.location.id, name: ctx.location.name, slug: ctx.location.slug },
    seasonModule,
  };
}

/**
 * Derive the roster team and build the schedule + division standings. Returns
 * an empty module (rosterTeamId null) when the season hasn't been set up yet —
 * the common case for a freshly reserved team.
 */
async function buildSeasonModule(
  db: Db,
  teamRegistrationId: string,
  sportSlug: string,
): Promise<TeamHubDetail["seasonModule"]> {
  const empty: TeamHubDetail["seasonModule"] = {
    rosterTeamId: null,
    rosterTeamName: null,
    schedule: [],
    standings: [],
    highlightTeamId: null,
  };

  // 1. Members' registrations → roster rows → the roster team.
  const memberRegs = await db
    .select({ registrationId: teamRegistrationMembers.registrationId })
    .from(teamRegistrationMembers)
    .where(eq(teamRegistrationMembers.teamRegistrationId, teamRegistrationId));
  const regIds = memberRegs.map((m) => m.registrationId);
  if (regIds.length === 0) return empty;

  const rosterRows = await db
    .select({ teamId: rosters.teamId })
    .from(rosters)
    .where(inArray(rosters.registrationId, regIds));
  if (rosterRows.length === 0) return empty;

  // Pick the most common team id among the members' roster rows.
  const counts = new Map<string, number>();
  for (const r of rosterRows) {
    counts.set(r.teamId, (counts.get(r.teamId) ?? 0) + 1);
  }
  const rosterTeamId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]![0];

  const teamRow = await db
    .select({
      id: teamsTable.id,
      name: teamsTable.name,
      seasonId: teamsTable.seasonId,
      division: teamsTable.division,
    })
    .from(teamsTable)
    .where(eq(teamsTable.id, rosterTeamId))
    .limit(1);
  if (teamRow.length === 0) return empty;
  const rosterTeam = teamRow[0]!;

  // 2. All teams + games in the season (standings are a season/division cache).
  const [seasonTeams, seasonGames] = await Promise.all([
    db
      .select({
        id: teamsTable.id,
        name: teamsTable.name,
        division: teamsTable.division,
      })
      .from(teamsTable)
      .where(eq(teamsTable.seasonId, rosterTeam.seasonId))
      .orderBy(asc(teamsTable.name)),
    db
      .select({
        id: gamesTable.id,
        homeTeamId: gamesTable.homeTeamId,
        awayTeamId: gamesTable.awayTeamId,
        homeScore: gamesTable.homeScore,
        awayScore: gamesTable.awayScore,
        status: gamesTable.status,
        scheduledAt: gamesTable.scheduledAt,
        venueId: gamesTable.venueId,
      })
      .from(gamesTable)
      .where(eq(gamesTable.seasonId, rosterTeam.seasonId)),
  ]);

  // Standings scoped to the roster team's division (fall back to whole season
  // when the team has no division set).
  const divisionTeams = rosterTeam.division
    ? seasonTeams.filter((t) => t.division === rosterTeam.division)
    : seasonTeams;
  const divisionTeamIds = new Set(divisionTeams.map((t) => t.id));
  const standings = computeStandings(
    divisionTeams.map((t) => ({ id: t.id, name: t.name })),
    seasonGames
      .filter(
        (g) =>
          (g.homeTeamId && divisionTeamIds.has(g.homeTeamId)) ||
          (g.awayTeamId && divisionTeamIds.has(g.awayTeamId)),
      )
      .map<GameInput>((g) => ({
        homeTeamId: g.homeTeamId,
        awayTeamId: g.awayTeamId,
        homeScore: g.homeScore,
        awayScore: g.awayScore,
        status: g.status,
      })),
    rulesForSport(sportSlug),
  );

  // 3. The team's own schedule (opponent + venue names, results or upcoming).
  const nameById = new Map(seasonTeams.map((t) => [t.id, t.name]));
  const venueIds = [
    ...new Set(
      seasonGames
        .filter(
          (g) => g.homeTeamId === rosterTeamId || g.awayTeamId === rosterTeamId,
        )
        .map((g) => g.venueId)
        .filter((v): v is string => v != null),
    ),
  ];
  const venueRows =
    venueIds.length > 0
      ? await db
          .select({ id: venuesTable.id, name: venuesTable.name })
          .from(venuesTable)
          .where(inArray(venuesTable.id, venueIds))
      : [];
  const venueNameById = new Map(venueRows.map((v) => [v.id, v.name]));

  const schedule: SeasonScheduleGame[] = seasonGames
    .filter((g) => g.homeTeamId === rosterTeamId || g.awayTeamId === rosterTeamId)
    .sort(
      (a, b) =>
        new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
    )
    .map((g) => {
      const isHome = g.homeTeamId === rosterTeamId;
      const opponentId = isHome ? g.awayTeamId : g.homeTeamId;
      return {
        id: g.id,
        scheduledAt: new Date(g.scheduledAt).toISOString(),
        status: g.status,
        isHome,
        opponent: opponentId ? nameById.get(opponentId) ?? "TBD" : "TBD",
        venue: g.venueId ? venueNameById.get(g.venueId) ?? null : null,
        teamScore: isHome ? g.homeScore : g.awayScore,
        opponentScore: isHome ? g.awayScore : g.homeScore,
      };
    });

  return {
    rosterTeamId,
    rosterTeamName: rosterTeam.name,
    schedule,
    standings,
    highlightTeamId: rosterTeamId,
  };
}
