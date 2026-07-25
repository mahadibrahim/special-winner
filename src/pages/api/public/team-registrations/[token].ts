import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import {
  teamRegistrations,
  teamRegistrationMembers,
  teamInvitees,
  seasons,
  programs,
  sports,
  locations,
  registrations,
  familyMembers,
} from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";
import {
  captainDepositCreditCents,
  captainShareDueCents,
  teamCollectedCents,
  teamDepositPaid,
} from "@/lib/registrations/captain-credit";
import { registrationAmountDueCents } from "@/lib/registrations/amount-due";

/**
 * Resolve a team by its invite token. Used by the team landing page so
 * joining players see what they're signing up for, and by the captain
 * status view to see who has joined.
 */
export const GET: APIRoute = async ({ params, locals, request }) => {
  const token = params.token;
  if (!token) {
    return new Response(
      JSON.stringify({ error: "Missing token" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (!db) {
    return new Response(
      JSON.stringify({ error: "Database unavailable" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  try {
    const teamRow = await db
      .select({
        team: teamRegistrations,
        season: seasons,
        program: programs,
        sport: sports,
        location: locations,
      })
      .from(teamRegistrations)
      .innerJoin(seasons, eq(teamRegistrations.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(sports, eq(programs.sportId, sports.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(eq(teamRegistrations.inviteToken, token))
      .limit(1);

    if (teamRow.length === 0) {
      return new Response(
        JSON.stringify({ error: "Team not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    const t = teamRow[0]!;

    // Cross-tenant guard: 404 (not 403) — hides existence of cross-tenant rows.
    // Consistent with the seasons/[id] precedent (Task 6).
    const organization = locals.organization;
    if (!organization || t.team.organizationId !== organization.id) {
      return new Response(
        JSON.stringify({ error: "Not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }

    // Members and invitees are independent reads, both scoped by
    // t.team.id — fetch concurrently.
    const [members, invitees] = await Promise.all([
      // Pull confirmed members + their registration status (no PII beyond first name + last initial).
      db
        .select({
          memberId: teamRegistrationMembers.id,
          role: teamRegistrationMembers.role,
          joinedAt: teamRegistrationMembers.joinedAt,
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
        .where(eq(teamRegistrationMembers.teamRegistrationId, t.team.id)),
      // Invitees: captain-assigned shares + their pay status. Surfaced so the
      // captain status view (and the API test) can see who was invited, for how
      // much, and whether they've paid.
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
        .where(eq(teamInvitees.teamRegistrationId, t.team.id))
        .orderBy(asc(teamInvitees.invitedAt)),
    ]);

    // Live payment summary for the captain tracker: deposit + sum of paid
    // teammate shares, against the full team fee. Computed server-side so the
    // client never has to trust/replay status logic. The captain's own paid
    // share is capped by the deposit (teamCollectedCents) — the deposit
    // already covers the first $deposit of it, so counting both would
    // double-count (see captain-credit.ts).
    const depositCents = t.team.depositCents ?? 0;
    const captainEmailLower = t.team.captainEmail.toLowerCase();
    const collectedCents = teamCollectedCents({
      depositCents,
      invitees: invitees.map((i) => ({
        assignedShareCents: i.assignedShareCents,
        status: i.status,
        isCaptain: i.email.toLowerCase() === captainEmailLower,
      })),
    });

    // Captain-credit preview for the authed viewer: when the signed-in user
    // is this team's captain and the deposit is verifiably paid, tell the
    // client what their own registration will cost after the deposit credit.
    // Display-only — createRegistration recomputes the credit server-side.
    const viewer = locals.user;
    const viewerEmailLower = viewer?.email.toLowerCase() ?? null;
    // Hoisted so both the captain-credit preview below AND invitee-list
    // serialization can reuse the same captain check. Guests → false.
    const isCaptain = viewer
      ? t.team.captainUserId != null
        ? t.team.captainUserId === viewer.id
        : captainEmailLower === viewerEmailLower
      : false;

    let viewerCaptainCredit: {
      shareCents: number;
      creditCents: number;
      dueCents: number;
      depositCents: number;
    } | null = null;
    if (isCaptain && teamDepositPaid(t.team)) {
      const inviteeRow = invitees.find(
        (i) => i.email.toLowerCase() === viewerEmailLower,
      );
      if (!inviteeRow || inviteeRow.status !== "paid") {
        const shareCents = inviteeRow
          ? inviteeRow.assignedShareCents ?? 0
          : registrationAmountDueCents(t.season, "full");
        viewerCaptainCredit = {
          shareCents,
          creditCents: captainDepositCreditCents(shareCents, depositCents),
          dueCents: captainShareDueCents(shareCents, depositCents),
          depositCents,
        };
      }
    }

    // Viewer-scoped share: the ONE invitee row this viewer may see. Authed
    // email match wins; otherwise an `?invitee=<id>` ref carried by the
    // personal invite-email link. Never exposes any other invitee.
    const url = new URL(request.url);
    const inviteeRef = url.searchParams.get("invitee");
    let viewerShare: { shareCents: number; status: string } | null = null;
    const ownRow = viewerEmailLower
      ? invitees.find((i) => i.email.toLowerCase() === viewerEmailLower)
      : null;
    const refRow =
      !ownRow && inviteeRef
        ? invitees.find((i) => i.id === inviteeRef)
        : null;
    const shareRow = ownRow ?? refRow;
    if (shareRow) {
      viewerShare = {
        shareCents: shareRow.assignedShareCents,
        status: shareRow.status,
      };
    }

    return new Response(
      JSON.stringify({
        team: {
          id: t.team.id,
          teamName: t.team.teamName,
          captainName: t.team.captainName,
          status: t.team.status,
          createdAt: t.team.createdAt,
          memberCount: members.length,
          members: members.map((m) => ({
            firstName: m.firstName,
            lastInitial: m.lastName ? m.lastName[0] : null,
            role: m.role,
            registrationStatus: m.registrationStatus,
            paymentStatus: m.paymentStatus,
            waiverSigned: m.waiverSigned,
          })),
          inviteeCount: invitees.length,
          invitees: isCaptain
            ? invitees.map((i) => ({
                id: i.id,
                email: i.email,
                assignedShareCents: i.assignedShareCents,
                status: i.status,
                paidAt: i.paidAt,
              }))
            : [],
        },
        viewerCaptainCredit,
        viewerShare,
        payment: {
          teamFeeCents: t.team.teamFeeCents ?? null,
          depositCents,
          collectedCents,
          invitees: isCaptain
            ? invitees.map((i) => ({
                email: i.email,
                assignedShareCents: i.assignedShareCents,
                status: i.status,
              }))
            : [],
        },
        season: {
          id: t.season.id,
          name: t.season.name,
          slug: t.season.slug,
          startDate: t.season.startDate,
          endDate: t.season.endDate,
          price: t.season.priceCents / 100,
          maxParticipants: t.season.maxParticipants,
        },
        program: {
          id: t.program.id,
          name: t.program.name,
        },
        sport: {
          id: t.sport.id,
          name: t.sport.name,
          slug: t.sport.slug,
        },
        location: {
          id: t.location.id,
          name: t.location.name,
          slug: t.location.slug,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[team-registrations/[token]] fetch failed", err);
    return new Response(
      JSON.stringify({ error: "Could not load team" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
