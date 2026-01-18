import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { users, registrations, rosters, teams, games, venues, seasons, programs, familyMembers } from "@/lib/db/schema";
import { eq, and, or, gte } from "drizzle-orm";
import { generateICalFeed } from "@/lib/calendar/ical";

export const GET: APIRoute = async ({ params }) => {
  const { userId } = params;

  if (!userId) {
    return new Response("User ID required", { status: 400 });
  }

  try {
    // Verify user exists
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      return new Response("User not found", { status: 404 });
    }

    // Get user's family members
    const userFamilyMembers = await db
      .select({ id: familyMembers.id })
      .from(familyMembers)
      .where(eq(familyMembers.parentUserId, userId));

    const familyMemberIds = userFamilyMembers.map((fm) => fm.id);

    if (familyMemberIds.length === 0) {
      // No family members, return empty calendar
      const icalContent = generateICalFeed("Aspire Sports Schedule", []);
      return new Response(icalContent, {
        status: 200,
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition": `attachment; filename="aspire-sports-${userId}.ics"`,
        },
      });
    }

    // Get registrations for user's family members
    const userRegistrations = await db
      .select({
        id: registrations.id,
        familyMemberId: registrations.familyMemberId,
        seasonId: registrations.seasonId,
      })
      .from(registrations)
      .where(
        and(
          eq(registrations.status, "confirmed"),
          or(...familyMemberIds.map((id) => eq(registrations.familyMemberId, id)))
        )
      );

    if (userRegistrations.length === 0) {
      const icalContent = generateICalFeed("Aspire Sports Schedule", []);
      return new Response(icalContent, {
        status: 200,
        headers: {
          "Content-Type": "text/calendar; charset=utf-8",
          "Content-Disposition": `attachment; filename="aspire-sports-${userId}.ics"`,
        },
      });
    }

    const registrationIds = userRegistrations.map((r) => r.id);
    const seasonIds = [...new Set(userRegistrations.map((r) => r.seasonId))];

    // Get teams for these registrations (via rosters)
    const userRosters = await db
      .select({ teamId: rosters.teamId })
      .from(rosters)
      .where(or(...registrationIds.map((id) => eq(rosters.registrationId, id))));

    const teamIds = [...new Set(userRosters.map((r) => r.teamId))];

    // Get upcoming games for these teams or seasons
    const now = new Date();
    const gamesData = await db
      .select({
        id: games.id,
        seasonId: games.seasonId,
        homeTeamId: games.homeTeamId,
        awayTeamId: games.awayTeamId,
        venueId: games.venueId,
        fieldNumber: games.fieldNumber,
        scheduledAt: games.scheduledAt,
        durationMinutes: games.durationMinutes,
        status: games.status,
      })
      .from(games)
      .where(
        and(
          gte(games.scheduledAt, now),
          eq(games.status, "scheduled"),
          or(...seasonIds.map((id) => eq(games.seasonId, id)))
        )
      );

    // Filter to only games involving user's teams
    const relevantGames = gamesData.filter(
      (game) =>
        teamIds.includes(game.homeTeamId!) || teamIds.includes(game.awayTeamId!)
    );

    // Fetch related data for events
    const allTeamIds = [
      ...new Set([
        ...relevantGames.map((g) => g.homeTeamId).filter(Boolean),
        ...relevantGames.map((g) => g.awayTeamId).filter(Boolean),
      ]),
    ];

    const venueIds = [...new Set(relevantGames.map((g) => g.venueId).filter(Boolean))];

    const teamsMap = new Map();
    const venuesMap = new Map();
    const seasonsMap = new Map();

    if (allTeamIds.length > 0) {
      const teamsList = await db.select().from(teams);
      teamsList.forEach((t) => teamsMap.set(t.id, t));
    }

    if (venueIds.length > 0) {
      const venuesList = await db.select().from(venues);
      venuesList.forEach((v) => venuesMap.set(v.id, v));
    }

    if (seasonIds.length > 0) {
      const seasonsList = await db
        .select({
          id: seasons.id,
          name: seasons.name,
          programId: seasons.programId,
        })
        .from(seasons);

      const programIds = [...new Set(seasonsList.map((s) => s.programId))];
      const programsList = await db.select().from(programs);
      const programsMap = new Map();
      programsList.forEach((p) => programsMap.set(p.id, p));

      seasonsList.forEach((s) => {
        seasonsMap.set(s.id, {
          ...s,
          program: programsMap.get(s.programId),
        });
      });
    }

    // Build calendar events
    const events = relevantGames.map((game) => {
      const homeTeam = teamsMap.get(game.homeTeamId);
      const awayTeam = teamsMap.get(game.awayTeamId);
      const venue = venuesMap.get(game.venueId);
      const season = seasonsMap.get(game.seasonId);

      const title =
        homeTeam && awayTeam
          ? `${homeTeam.name} vs ${awayTeam.name}`
          : season?.program?.name
          ? `${season.program.name} Game`
          : "Game";

      const startDate = new Date(game.scheduledAt);
      const endDate = new Date(startDate.getTime() + (game.durationMinutes || 60) * 60 * 1000);

      let location = "";
      if (venue) {
        location = venue.name;
        if (game.fieldNumber) {
          location += ` - Field ${game.fieldNumber}`;
        }
        if (venue.address) {
          location += `\n${venue.address}`;
        }
      }

      let description = "";
      if (season?.program?.name) {
        description = `${season.program.name} - ${season.name}`;
      }

      return {
        uid: `game-${game.id}@aspiresports.com`,
        title,
        description,
        location,
        startDate,
        endDate,
      };
    });

    const calendarName = `Aspire Sports - ${user.firstName || "My"} Schedule`;
    const icalContent = generateICalFeed(calendarName, events);

    return new Response(icalContent, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="aspire-sports-${userId}.ics"`,
      },
    });
  } catch (error) {
    console.error("Error generating calendar:", error);
    return new Response("Failed to generate calendar", { status: 500 });
  }
};
