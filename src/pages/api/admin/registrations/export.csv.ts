import type { APIRoute } from "astro";
import { eq, and, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  registrations,
  familyMembers,
  seasons,
  programs,
  sports,
  users,
  teamRegistrations,
  teamRegistrationMembers,
} from "@/lib/db/schema";
import { locations } from "@/lib/db/schema/organizations";
import {
  requireSuperAdminAccess,
  requireOrganizationContext,
} from "@/lib/auth";
import { toCsvRow } from "@/lib/csv/to-csv-row";

/**
 * GET /api/admin/registrations/export.csv
 *
 * Streams a tenant-scoped CSV of registrations. Same filter surface as
 * GET /api/admin/registrations (status, paymentStatus, seasonId) so the
 * UI can hand the same filter state to either endpoint.
 *
 * No pagination — exports the full match set. For the launch-cohort
 * size (single-digit thousands max), one query + one response is fine;
 * if we outgrow that, switch to a streaming Response body before the
 * row count gets unreasonable.
 */
const HEADER = [
  "registration_id",
  "status",
  "payment_status",
  "amount_paid_cents",
  "amount_due_cents",
  "player_first_name",
  "player_last_name",
  "parent_email",
  "parent_first_name",
  "parent_last_name",
  "season_name",
  "program_name",
  "sport_name",
  "waiver_signed",
  "created_at",
  "cancelled_at",
  // Team-registration context — a team member's own amounts are $0/$0 when
  // the captain's deposit covers them (#525), so the team's money state
  // rides along for reconciliation.
  "team_name",
  "team_fee_cents",
  "team_deposit_cents",
];

export const GET: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const url = new URL(context.request.url);
  const status = url.searchParams.get("status");
  const paymentStatus = url.searchParams.get("paymentStatus");
  const seasonId = url.searchParams.get("seasonId");

  const conditions = [
    eq(locations.organizationId, orgContext.organizationId),
  ];
  if (status && status !== "all") {
    conditions.push(eq(registrations.status, status as any));
  }
  if (paymentStatus && paymentStatus !== "all") {
    conditions.push(eq(registrations.paymentStatus, paymentStatus as any));
  }
  if (seasonId) {
    conditions.push(eq(registrations.seasonId, seasonId));
  }

  const rows = await getDb()
    .select({
      id: registrations.id,
      status: registrations.status,
      paymentStatus: registrations.paymentStatus,
      amountPaidCents: registrations.amountPaidCents,
      amountDueCents: registrations.amountDueCents,
      playerFirst: familyMembers.firstName,
      playerLast: familyMembers.lastName,
      parentEmail: users.email,
      parentFirst: users.firstName,
      parentLast: users.lastName,
      seasonName: seasons.name,
      programName: programs.name,
      sportName: sports.name,
      waiverSigned: registrations.waiverSigned,
      createdAt: registrations.createdAt,
      cancelledAt: registrations.cancelledAt,
      teamName: teamRegistrations.teamName,
      teamFeeCents: teamRegistrations.teamFeeCents,
      teamDepositCents: teamRegistrations.depositCents,
    })
    .from(registrations)
    .innerJoin(
      familyMembers,
      eq(registrations.familyMemberId, familyMembers.id),
    )
    .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .innerJoin(sports, eq(programs.sportId, sports.id))
    .innerJoin(users, eq(registrations.registeredByUserId, users.id))
    .leftJoin(
      teamRegistrationMembers,
      eq(teamRegistrationMembers.registrationId, registrations.id),
    )
    .leftJoin(
      teamRegistrations,
      eq(teamRegistrationMembers.teamRegistrationId, teamRegistrations.id),
    )
    .where(and(...conditions))
    .orderBy(desc(registrations.createdAt));

  const lines = [
    toCsvRow(HEADER),
    ...rows.map((r) =>
      toCsvRow([
        r.id,
        r.status,
        r.paymentStatus,
        r.amountPaidCents,
        r.amountDueCents,
        r.playerFirst,
        r.playerLast,
        r.parentEmail,
        r.parentFirst,
        r.parentLast,
        r.seasonName,
        r.programName,
        r.sportName,
        r.waiverSigned ? "yes" : "no",
        r.createdAt,
        r.cancelledAt,
        r.teamName,
        r.teamFeeCents,
        r.teamDepositCents,
      ]),
    ),
  ];

  const body = lines.join("\n") + "\n";
  const dateStamp = new Date().toISOString().slice(0, 10);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="registrations-${dateStamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
};
