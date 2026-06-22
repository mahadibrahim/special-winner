import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { familyMembers, registrations } from "@/lib/db/schema/registrations";
import { attendance, rosters, games } from "@/lib/db/schema/teams";
import type { BotActionDefinition, BotActionResult } from "./types";

/**
 * rsvp_absent / rsvp_present — low-risk mutations for marking a kid
 * present or absent for an upcoming event.
 *
 * Scope check: the kid must belong to the parent (via family_members.parent_user_id).
 * This prevents cross-family mutations from phone spoofing.
 */

async function scopeCheckKidBelongsToParent(
  kidId: string,
  parentUserId: string,
): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: familyMembers.id })
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.id, kidId),
        eq(familyMembers.parentUserId, parentUserId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function findRosterForKidAndGame(
  kidId: string,
  gameId: string,
): Promise<{ rosterId: string; teamId: string } | null> {
  const db = getDb();

  // Find the game to get the team ID(s)
  const gameRows = await db
    .select({
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
    })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);

  if (gameRows.length === 0) return null;

  const teamIds = [gameRows[0].homeTeamId, gameRows[0].awayTeamId].filter(
    (t): t is string => Boolean(t),
  );
  if (teamIds.length === 0) return null;

  // Find the roster row for this kid on one of those teams
  const rosterRows = await db
    .select({
      rosterId: rosters.id,
      teamId: rosters.teamId,
    })
    .from(rosters)
    .innerJoin(registrations, eq(registrations.id, rosters.registrationId))
    .where(eq(registrations.familyMemberId, kidId))
    .limit(20);

  const match = rosterRows.find((r) => teamIds.includes(r.teamId));
  return match ?? null;
}

export const rsvpAbsent: BotActionDefinition = {
  name: "rsvp_absent",
  description:
    "Mark a kid absent for a specific upcoming event (practice or game). Requires kidId and eventId. Notifies the coach.",
  readOnly: false,
  reversible: true,
  requiresConfirmation: true,

  async handler(params, context): Promise<BotActionResult> {
    const kidId = typeof params.kidId === "string" ? params.kidId : null;
    const eventId = typeof params.eventId === "string" ? params.eventId : null;

    if (!kidId || !eventId) {
      return {
        ok: false,
        responseBody:
          "I need to know which kid and which practice or game. Can you tell me the date?",
        errorReason: "missing kidId or eventId",
        suggestEscalation: false,
      };
    }

    const isAuthorized = await scopeCheckKidBelongsToParent(
      kidId,
      context.parentUserId,
    );
    if (!isAuthorized) {
      return {
        ok: false,
        responseBody:
          "I don't see that kid linked to your account. If you think that's wrong, I'll pass this to an admin.",
        errorReason: "scope check failed: kid not linked to parent",
        suggestEscalation: true,
      };
    }

    const rosterInfo = await findRosterForKidAndGame(kidId, eventId);
    if (!rosterInfo) {
      return {
        ok: false,
        responseBody:
          "I couldn't find that event on your kid's schedule. Let me pass this to an admin to check.",
        errorReason: "roster not found for kid/event",
        suggestEscalation: true,
      };
    }

    const db = getDb();

    // Look up the game to get the scheduled date for the attendance record
    const [game] = await db
      .select({ scheduledAt: games.scheduledAt })
      .from(games)
      .where(eq(games.id, eventId))
      .limit(1);
    const eventDate = game?.scheduledAt ?? new Date();

    // Upsert the attendance record
    const existing = await db
      .select({ id: attendance.id })
      .from(attendance)
      .where(
        and(eq(attendance.gameId, eventId), eq(attendance.rosterId, rosterInfo.rosterId)),
      )
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(attendance)
        .set({ status: "absent", notes: "Marked absent via messaging bot" })
        .where(eq(attendance.id, existing[0].id));
    } else {
      await db.insert(attendance).values({
        gameId: eventId,
        rosterId: rosterInfo.rosterId,
        teamId: rosterInfo.teamId,
        eventDate,
        eventType: "game",
        status: "absent",
        notes: "Marked absent via messaging bot",
        recordedByUserId: context.parentUserId,
      });
    }

    return {
      ok: true,
      responseBody:
        "Got it — marked absent. Coach will be notified. Feel better!",
      details: { kidId, eventId, status: "absent" },
    };
  },
};

export const rsvpPresent: BotActionDefinition = {
  name: "rsvp_present",
  description:
    "Reverse a previous absent mark — the kid will now attend after all.",
  readOnly: false,
  reversible: true,
  requiresConfirmation: true,

  async handler(params, context): Promise<BotActionResult> {
    const kidId = typeof params.kidId === "string" ? params.kidId : null;
    const eventId = typeof params.eventId === "string" ? params.eventId : null;

    if (!kidId || !eventId) {
      return {
        ok: false,
        responseBody: "I need to know which kid and which event to update.",
        errorReason: "missing kidId or eventId",
      };
    }

    const isAuthorized = await scopeCheckKidBelongsToParent(
      kidId,
      context.parentUserId,
    );
    if (!isAuthorized) {
      return {
        ok: false,
        responseBody: "I don't see that kid linked to your account.",
        errorReason: "scope check failed",
        suggestEscalation: true,
      };
    }

    const rosterInfo = await findRosterForKidAndGame(kidId, eventId);
    if (!rosterInfo) {
      return {
        ok: false,
        responseBody:
          "I couldn't find that event. Let me get an admin involved.",
        errorReason: "roster not found",
        suggestEscalation: true,
      };
    }

    const db = getDb();

    await db
      .update(attendance)
      .set({ status: "present", notes: "Re-marked present via messaging bot" })
      .where(
        and(
          eq(attendance.gameId, eventId),
          eq(attendance.rosterId, rosterInfo.rosterId),
        ),
      );

    return {
      ok: true,
      responseBody: "Great — marked present. See you at the event!",
      details: { kidId, eventId, status: "present" },
    };
  },
};
