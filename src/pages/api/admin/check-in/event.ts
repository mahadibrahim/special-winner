/**
 * GET /api/admin/check-in/event?kind=&id=
 * Returns event header + the people rows for the event:
 *   - drop_in_session → bookings (confirmed + held rows; each row carries
 *                        `status` so the desk can see holds. `status` alone
 *                        is the discriminator between the two hold kinds:
 *                          - pending_payment → walk-in pay-link hold
 *                            (kiosk/walkin/start). The desk can resend the
 *                            pay link or cancel the hold.
 *                          - pending_claim   → promoted waitlister
 *                            (lib/dropin/promotion.ts). Passive — the desk
 *                            cannot cancel it here; it expires on its own or
 *                            is claimed by the customer.
 *   - field_rental    → single renter row
 *   - game            → combined roster from home + away teams
 *
 * `waiverSigned` on a row is a QUESTION ANSWERED FOR THE DESK ("is this person
 * cleared to play?"), not a column dump: it is true when the row itself
 * carries a signature OR when the person is covered by the org's annual
 * liability waiver (src/lib/consents/liability.ts). The roll-call chip that
 * renders it drives whether staff chase someone at the door, and chasing a
 * family who signed three weeks ago at another door is a false alarm.
 * Coverage is resolved in ONE batch per response — this endpoint is polled
 * every 5s by PickupRollCall.
 */
import type { APIRoute } from "astro";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { venues, games, rosters, teams } from "@/lib/db/schema/teams";
import { registrations, familyMembers } from "@/lib/db/schema/registrations";
import { users } from "@/lib/db/schema/users";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { requireSameOrgGame } from "@/lib/auth/require-resource-ownership";
import { formatPhone } from "@/lib/phone";
import { hasValidLiabilityWaiverBatch } from "@/lib/consents/liability";
import { findSelfPersonIds } from "@/lib/registrations/resolve-person";
import { renterWaiverOnFile } from "@/lib/rentals/waiver-on-file";

export const prerender = false;
const json = (b: unknown, s: number) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  const kind = context.url.searchParams.get("kind");
  const id = context.url.searchParams.get("id");
  if (!kind || !id) return json({ error: "kind + id required" }, 400);

  const db = getDb();

  // ── Drop-in session ──────────────────────────────────────────────────────
  if (kind === "drop_in_session") {
    const [session] = await db
      .select({
        id: dropInSessions.id,
        startsAt: dropInSessions.startsAt,
        endsAt: dropInSessions.endsAt,
        title: dropInSessions.sportOrClassLabel,
        venueName: venues.name,
        orgId: dropInSessions.organizationId,
      })
      .from(dropInSessions)
      .innerJoin(venues, eq(venues.id, dropInSessions.venueId))
      .where(eq(dropInSessions.id, id))
      .limit(1);
    if (!session || session.orgId !== orgId) return json({ error: "Not found" }, 404);

    const rows = await db
      .select({
        bookingId: dropInBookings.id,
        userId: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        phone: users.phone,
        avatarUrl: users.avatarUrl,
        waiverSigned: dropInBookings.waiverSigned,
        // WHO the booking is for, for the coverage probe below. Set only when
        // the participant is not the booking's user (a kiosk walk-in for a
        // minor); otherwise the booker IS the participant and coverage hangs
        // off their SELF person row.
        familyMemberId: dropInBookings.familyMemberId,
        checkedInAt: dropInBookings.checkedInAt,
        amountPaidCents: dropInBookings.amountPaidCents,
        sessionRateCents: dropInSessions.sessionRateCents,
        walkUpRateCents: dropInSessions.walkUpRateCents,
        status: dropInBookings.status,
      })
      .from(dropInBookings)
      .innerJoin(users, eq(users.id, dropInBookings.userId))
      .innerJoin(dropInSessions, eq(dropInSessions.id, dropInBookings.sessionId))
      .where(
        and(
          eq(dropInBookings.sessionId, id),
          inArray(dropInBookings.status, ["confirmed", "pending_payment", "pending_claim"]),
        ),
      );

    // Annual-waiver coverage for the whole roster in one pass. Fails toward
    // OUTSTANDING (empty set → the chip falls back to the row's own stamp):
    // showing "waiver out" for someone already covered costs one question at
    // the desk; the reverse waves through a person with no release.
    let coveredPersonIds = new Set<string>();
    let selfPersonByUser = new Map<string, string>();
    try {
      selfPersonByUser = await findSelfPersonIds(
        db,
        rows.filter((r) => !r.familyMemberId).map((r) => r.userId),
      );
      const personIds = [
        ...rows.map((r) => r.familyMemberId),
        ...selfPersonByUser.values(),
      ].filter((id): id is string => Boolean(id));
      const verdicts = await hasValidLiabilityWaiverBatch(personIds, orgId, db);
      coveredPersonIds = new Set(
        [...verdicts.entries()].filter(([, ok]) => ok).map(([id]) => id),
      );
    } catch (err) {
      console.error("[check-in/event] waiver coverage batch failed", err);
    }

    return json(
      {
        event: {
          kind: "drop_in_session",
          id: session.id,
          title: session.title,
          startsAt: session.startsAt.toISOString(),
          endsAt: session.endsAt.toISOString(),
          fieldNumber: null,
          venueName: session.venueName,
        },
        rows: rows
          .map((r) => {
            // Effective rate for this booking: walk-up rate takes precedence when set,
            // otherwise fall back to session rate. A null/0 rate means the session is
            // free, so the booking is implicitly paid.
            const effectiveRate = r.walkUpRateCents ?? r.sessionRateCents ?? 0;
            const paid = r.amountPaidCents > 0 || effectiveRate === 0;
            const personId =
              r.familyMemberId ?? selfPersonByUser.get(r.userId) ?? null;
            return {
              rowKind: "drop_in_booking" as const,
              targetId: r.bookingId,
              name: `${r.firstName ?? ""} ${r.lastName ?? ""}`.trim() || r.email,
              subtitle: `adult · ${formatPhone(r.phone)}`,
              photoUrl: r.avatarUrl,
              waiverSigned:
                r.waiverSigned ||
                (personId !== null && coveredPersonIds.has(personId)),
              checkedInAt: r.checkedInAt ? r.checkedInAt.toISOString() : null,
              isMinor: false,
              familyMemberId: null,
              recipientUserId: r.userId,
              paid,
              status: r.status as "confirmed" | "pending_payment" | "pending_claim",
            };
          })
          // Confirmed rows first so held rows (pending_payment / pending_claim)
          // group at the bottom.
          .sort((a, b) => (a.status === b.status ? 0 : a.status === "confirmed" ? -1 : 1)),
      },
      200,
    );
  }

  // ── Field rental ─────────────────────────────────────────────────────────
  if (kind === "field_rental") {
    const [row] = await db
      .select({
        rental: fieldRentals,
        venueName: venues.name,
      })
      .from(fieldRentals)
      .innerJoin(venues, eq(venues.id, fieldRentals.venueId))
      .where(eq(fieldRentals.id, id))
      .limit(1);
    if (!row || row.rental.organizationId !== orgId) return json({ error: "Not found" }, 404);

    const r = row.rental;
    // One renter, so the singular probe (which delegates to the same batch)
    // is the right shape here. It already fails toward asking on any error.
    const renterCovered = await renterWaiverOnFile(r.renterUserId, orgId, db);
    return json(
      {
        event: {
          kind: "field_rental",
          id: r.id,
          title: r.renterName,
          startsAt: r.startsAt.toISOString(),
          endsAt: r.endsAt.toISOString(),
          fieldNumber: r.fieldNumber,
          venueName: row.venueName,
        },
        rows: [
          {
            rowKind: "field_rental" as const,
            targetId: r.id,
            name: r.renterName,
            subtitle: `${r.partySize}-person party · ${formatPhone(r.renterPhone)}`,
            photoUrl: null,
            waiverSigned: r.waiverSigned || renterCovered,
            checkedInAt: r.checkedInAt ? r.checkedInAt.toISOString() : null,
            isMinor: false,
            familyMemberId: null,
            recipientUserId: r.renterUserId,
            paid: true, // field rentals are always paid at booking time
            status: "confirmed" as const,
          },
        ],
      },
      200,
    );
  }

  // ── Game ─────────────────────────────────────────────────────────────────
  if (kind === "game") {
    // game → season → program → location.organizationId. Without this a
    // cross-org admin could read any game's full roster (player PII) by id.
    const owned = await requireSameOrgGame(orgId, id);
    if (!owned.ok) return json({ error: "Not found" }, 404);

    const [game] = await db
      .select({
        id: games.id,
        scheduledAt: games.scheduledAt,
        durationMinutes: games.durationMinutes,
        fieldNumber: games.fieldNumber,
        venueName: venues.name,
        homeTeamId: games.homeTeamId,
        awayTeamId: games.awayTeamId,
      })
      .from(games)
      .innerJoin(venues, eq(venues.id, games.venueId))
      .where(eq(games.id, id))
      .limit(1);
    if (!game) return json({ error: "Not found" }, 404);

    const teamIds = [game.homeTeamId, game.awayTeamId].filter(Boolean) as string[];

    const teamRows =
      teamIds.length > 0
        ? await db
            .select({ id: teams.id, name: teams.name })
            .from(teams)
            .where(inArray(teams.id, teamIds))
        : [];

    const homeName = teamRows.find((t) => t.id === game.homeTeamId)?.name ?? "TBD";
    const awayName = teamRows.find((t) => t.id === game.awayTeamId)?.name ?? "TBD";

    const rosterRows =
      teamIds.length > 0
        ? await db
            .select({
              rosterId: rosters.id,
              firstName: familyMembers.firstName,
              lastName: familyMembers.lastName,
              birthDate: familyMembers.birthDate,
              parentUserId: familyMembers.parentUserId,
              selfUserId: familyMembers.selfUserId,
              familyMemberId: familyMembers.id,
              photoUrl: familyMembers.photoUrl,
            })
            .from(rosters)
            .innerJoin(registrations, eq(registrations.id, rosters.registrationId))
            .innerJoin(familyMembers, eq(familyMembers.id, registrations.familyMemberId))
            .where(
              and(
                eq(rosters.status, "active"),
                inArray(rosters.teamId, teamIds),
              ),
            )
        : [];

    return json(
      {
        event: {
          kind: "game",
          id: game.id,
          title: `${homeName} vs ${awayName}`,
          startsAt: game.scheduledAt.toISOString(),
          endsAt: new Date(
            game.scheduledAt.getTime() + (game.durationMinutes ?? 0) * 60_000,
          ).toISOString(),
          fieldNumber: game.fieldNumber ? Number(game.fieldNumber) || null : null,
          venueName: game.venueName,
        },
        rows: rosterRows.map((r) => {
          const isMinor = r.parentUserId !== null;
          const playerName = `${r.firstName} ${r.lastName}`.trim();
          return {
            rowKind: "roster_entry" as const,
            targetId: r.rosterId,
            name: playerName,
            subtitle: isMinor ? "youth" : "adult",
            photoUrl: r.photoUrl,
            waiverSigned: true, // rostered players signed waiver at registration
            checkedInAt: null, // game attendance not tracked at row level in v1
            isMinor,
            familyMemberId: r.familyMemberId,
            recipientUserId: r.parentUserId ?? r.selfUserId,
            paid: true, // rostered players paid at registration
            status: "confirmed" as const,
          };
        }),
      },
      200,
    );
  }

  return json({ error: "kind must be drop_in_session | field_rental | game" }, 400);
};
