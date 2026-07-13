import { describe, it, expect, beforeAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { hostGameReports } from "@/lib/db/schema/hosts";
import { users } from "@/lib/db/schema/users";
import { getAuthCookie, apiFetch } from "../setup/test-helpers";
import { createTestDropInSession, resolveDefaultOrgForHttpTests } from "../../utils/dropin-helpers";
import { createTestHostWithPassword } from "../../utils/host-helpers";

let organizationId: string;
let venueId: string;

beforeAll(async () => {
  ({ organizationId, venueId } = await resolveDefaultOrgForHttpTests());
});

async function hostCookie() {
  const host = await createTestHostWithPassword({ organizationId, preferredVenueId: venueId });
  return { host, cookie: await getAuthCookie(host.email, host.password) };
}

/** Insert a player user + a confirmed online-booking booking on a session. */
async function createPlayerBooking(sessionId: string) {
  const db = getDb();
  const [player] = await db
    .insert(users)
    .values({
      email: `game-day-player-${Date.now()}-${Math.random().toString(36).slice(2)}@t.example`,
      firstName: "Player",
      lastName: "One",
    })
    .returning();
  const [booking] = await db
    .insert(dropInBookings)
    .values({
      sessionId,
      userId: player.id,
      status: "confirmed",
      source: "online_booking",
      paymentMethod: "card_online",
      amountPaidCents: 1500,
    })
    .returning();
  return { player, booking };
}

async function claimedGame(opts: { startsAt?: Date; endsAt?: Date } = {}) {
  const { cookie, host } = await hostCookie();
  const ctx = await createTestDropInSession({
    organizationId,
    venueId,
    startsAt: opts.startsAt,
    endsAt: opts.endsAt,
  });
  const claim = await apiFetch(`/api/host/games/${ctx.sessionId}/claim`, {
    method: "POST",
    cookie,
  });
  expect(claim.status).toBe(200);
  return { cookie, host, ...ctx };
}

describe("host game-day APIs", () => {
  it("GET detail returns roster with the player + the host's comp booking", async () => {
    const { cookie, sessionId } = await claimedGame();
    const { player } = await createPlayerBooking(sessionId);

    const res = await apiFetch(`/api/host/games/${sessionId}`, { cookie });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.session.id).toBe(sessionId);
    expect(body.waitlistCount).toBe(0);

    const bookingUserIds = body.roster.map((r: { firstName: string; lastName: string }) => `${r.firstName} ${r.lastName}`);
    expect(bookingUserIds).toContain(`${player.firstName} ${player.lastName}`);
    expect(bookingUserIds).toContain("Test Host");
    expect(body.roster.length).toBe(2);
  });

  it("attendance: check_in then undo works; a bookingId from ANOTHER session is ignored", async () => {
    const { cookie, sessionId } = await claimedGame();
    const { booking } = await createPlayerBooking(sessionId);

    const otherCtx = await createTestDropInSession({ organizationId, venueId });
    const { booking: otherBooking } = await createPlayerBooking(otherCtx.sessionId);

    const checkIn = await apiFetch(`/api/host/games/${sessionId}/attendance`, {
      method: "POST",
      cookie,
      body: JSON.stringify({
        entries: [
          { bookingId: booking.id, action: "check_in" },
          { bookingId: otherBooking.id, action: "check_in" },
        ],
      }),
    });
    expect(checkIn.status).toBe(200);
    const checkInBody = await checkIn.json();
    // The foreign-session booking is excluded from the update count.
    expect(checkInBody.updated).toBe(1);

    const [afterCheckIn] = await getDb()
      .select({ checkedInAt: dropInBookings.checkedInAt })
      .from(dropInBookings)
      .where(eq(dropInBookings.id, booking.id));
    expect(afterCheckIn.checkedInAt).not.toBeNull();

    const [otherUnaffected] = await getDb()
      .select({ checkedInAt: dropInBookings.checkedInAt })
      .from(dropInBookings)
      .where(eq(dropInBookings.id, otherBooking.id));
    expect(otherUnaffected.checkedInAt).toBeNull();

    const undo = await apiFetch(`/api/host/games/${sessionId}/attendance`, {
      method: "POST",
      cookie,
      body: JSON.stringify({
        entries: [{ bookingId: booking.id, action: "undo_check_in" }],
      }),
    });
    expect(undo.status).toBe(200);
    const undoBody = await undo.json();
    expect(undoBody.updated).toBe(1);

    const [afterUndo] = await getDb()
      .select({ checkedInAt: dropInBookings.checkedInAt })
      .from(dropInBookings)
      .where(eq(dropInBookings.id, booking.id));
    expect(afterUndo.checkedInAt).toBeNull();
  });

  it("teams: assign player to \"orange\" works; team \"purple\" (not in teamColors) 400s", async () => {
    const { cookie, sessionId } = await claimedGame();
    const { booking } = await createPlayerBooking(sessionId);

    const assign = await apiFetch(`/api/host/games/${sessionId}/teams`, {
      method: "POST",
      cookie,
      body: JSON.stringify({
        assignments: [{ bookingId: booking.id, team: "orange" }],
      }),
    });
    expect(assign.status).toBe(200);
    const assignBody = await assign.json();
    expect(assignBody.updated).toBe(1);

    const [afterAssign] = await getDb()
      .select({ teamAssignment: dropInBookings.teamAssignment })
      .from(dropInBookings)
      .where(eq(dropInBookings.id, booking.id));
    expect(afterAssign.teamAssignment).toBe("orange");

    const invalid = await apiFetch(`/api/host/games/${sessionId}/teams`, {
      method: "POST",
      cookie,
      body: JSON.stringify({
        assignments: [{ bookingId: booking.id, team: "purple" }],
      }),
    });
    expect(invalid.status).toBe(400);
  });

  it("report before startsAt 400s with code too_early", async () => {
    const { cookie, sessionId } = await claimedGame({
      startsAt: new Date(Date.now() + 7 * 86400_000),
    });

    const res = await apiFetch(`/api/host/games/${sessionId}/report`, {
      method: "POST",
      cookie,
      body: JSON.stringify({ summary: "Great game, everyone had fun." }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("too_early");
  });

  it("report after start succeeds; row exists; second submit 409s", async () => {
    const { cookie, sessionId } = await claimedGame({
      startsAt: new Date(Date.now() - 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    const first = await apiFetch(`/api/host/games/${sessionId}/report`, {
      method: "POST",
      cookie,
      body: JSON.stringify({ summary: "Solid turnout, no issues." }),
    });
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.ok).toBe(true);

    const [report] = await getDb()
      .select()
      .from(hostGameReports)
      .where(eq(hostGameReports.sessionId, sessionId));
    expect(report).toBeDefined();
    expect(report.summary).toBe("Solid turnout, no issues.");

    const second = await apiFetch(`/api/host/games/${sessionId}/report`, {
      method: "POST",
      cookie,
      body: JSON.stringify({ summary: "Trying again." }),
    });
    expect(second.status).toBe(409);
    const secondBody = await second.json();
    expect(secondBody.code).toBe("already_reported");
  });

  it("report with incidentFlagged: true succeeds and persists the flag", async () => {
    const { cookie, sessionId } = await claimedGame({
      startsAt: new Date(Date.now() - 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 30 * 60 * 1000),
    });

    const res = await apiFetch(`/api/host/games/${sessionId}/report`, {
      method: "POST",
      cookie,
      body: JSON.stringify({
        summary: "A player twisted an ankle in the second half.",
        incidentFlagged: true,
        incidentDetails: "Iced it on the sideline, walked off under own power.",
      }),
    });
    expect(res.status).toBe(200);

    const [report] = await getDb()
      .select()
      .from(hostGameReports)
      .where(eq(hostGameReports.sessionId, sessionId));
    expect(report).toBeDefined();
    expect(report.incidentFlagged).toBe(true);
    expect(report.incidentDetails).toBe(
      "Iced it on the sideline, walked off under own power.",
    );
  });

  it("all five endpoints 403/404 for a host who does NOT host this session", async () => {
    const { sessionId } = await claimedGame({
      startsAt: new Date(Date.now() - 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 30 * 60 * 1000),
    });
    const { cookie: strangerCookie } = await hostCookie();

    const detail = await apiFetch(`/api/host/games/${sessionId}`, { cookie: strangerCookie });
    expect([403, 404]).toContain(detail.status);

    const attendance = await apiFetch(`/api/host/games/${sessionId}/attendance`, {
      method: "POST",
      cookie: strangerCookie,
      body: JSON.stringify({ entries: [] }),
    });
    expect([403, 404]).toContain(attendance.status);

    const teams = await apiFetch(`/api/host/games/${sessionId}/teams`, {
      method: "POST",
      cookie: strangerCookie,
      body: JSON.stringify({ assignments: [] }),
    });
    expect([403, 404]).toContain(teams.status);

    const report = await apiFetch(`/api/host/games/${sessionId}/report`, {
      method: "POST",
      cookie: strangerCookie,
      body: JSON.stringify({ summary: "Not my game." }),
    });
    expect([403, 404]).toContain(report.status);

    // Fifth surface: unclaim, already covered structurally by requireHostOfSession
    // but included here per the brief's "all five endpoints" wording.
    const unclaim = await apiFetch(`/api/host/games/${sessionId}/unclaim`, {
      method: "POST",
      cookie: strangerCookie,
    });
    expect([403, 404]).toContain(unclaim.status);
  });
});
