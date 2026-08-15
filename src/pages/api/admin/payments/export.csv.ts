import type { APIRoute } from "astro";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  payments,
  registrations,
  familyMembers,
  seasons,
  programs,
  users,
  teamRegistrations,
} from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { locations } from "@/lib/db/schema/organizations";
import {
  requireSuperAdminAccess,
  requireOrganizationContext,
} from "@/lib/auth";
import { toCsvRow } from "@/lib/csv/to-csv-row";

/**
 * GET /api/admin/payments/export.csv
 *
 * Streams a tenant-scoped CSV of payment transactions. Same filter
 * surface as GET /api/admin/payments (status, paymentType, startDate,
 * endDate) so the UI hands the same filter state to either endpoint.
 * This is the hand-to-the-CPA / reconcile-against-Stripe export —
 * stripe_payment_intent_id is included so rows can be matched against
 * the Stripe dashboard.
 *
 * No pagination — exports the full match set (see the registrations
 * export for the size rationale).
 */
const HEADER = [
  "payment_id",
  "amount_cents",
  "payment_type",
  "status",
  "stripe_payment_intent_id",
  "player_first_name",
  "player_last_name",
  "payer_email",
  "payer_first_name",
  "payer_last_name",
  "season_name",
  "program_name",
  "registration_id",
  "created_at",
  "team_registration_id",
  "team_name",
];

export const GET: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const url = new URL(context.request.url);
  const status = url.searchParams.get("status");
  const paymentType = url.searchParams.get("paymentType");
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");

  const conditions = [
    eq(locations.organizationId, orgContext.organizationId),
  ];
  if (status && status !== "all") {
    conditions.push(eq(payments.status, status as any));
  }
  if (paymentType && paymentType !== "all") {
    conditions.push(eq(payments.paymentType, paymentType as any));
  }
  if (startDate) {
    conditions.push(gte(payments.createdAt, new Date(startDate)));
  }
  if (endDate) {
    conditions.push(lte(payments.createdAt, new Date(endDate)));
  }

  const rows = await getDb()
    .select({
      id: payments.id,
      amountCents: payments.amountCents,
      paymentType: payments.paymentType,
      status: payments.status,
      stripePaymentIntentId: payments.stripePaymentIntentId,
      playerFirst: familyMembers.firstName,
      playerLast: familyMembers.lastName,
      payerEmail: users.email,
      payerFirst: users.firstName,
      payerLast: users.lastName,
      seasonName: seasons.name,
      programName: programs.name,
      registrationId: registrations.id,
      createdAt: payments.createdAt,
      teamRegistrationId: teamRegistrations.id,
      teamName: teamRegistrations.teamName,
    })
    .from(payments)
    // Solo payments resolve via registrations, team-level payments (captain
    // deposit / backstop balance / their refunds) via team_registrations —
    // the seasons join on COALESCE covers both (see payments.ts).
    .leftJoin(registrations, eq(payments.registrationId, registrations.id))
    .leftJoin(
      teamRegistrations,
      eq(payments.teamRegistrationId, teamRegistrations.id),
    )
    .leftJoin(
      familyMembers,
      eq(registrations.familyMemberId, familyMembers.id),
    )
    .innerJoin(
      seasons,
      sql`${seasons.id} = COALESCE(${registrations.seasonId}, ${teamRegistrations.seasonId})`,
    )
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .innerJoin(users, eq(payments.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(payments.createdAt));

  const lines = [
    toCsvRow(HEADER),
    ...rows.map((r) =>
      toCsvRow([
        r.id,
        r.amountCents,
        r.paymentType,
        r.status,
        r.stripePaymentIntentId,
        r.playerFirst,
        r.playerLast,
        r.payerEmail,
        r.payerFirst,
        r.payerLast,
        r.seasonName,
        r.programName,
        r.registrationId,
        r.createdAt,
        r.teamRegistrationId,
        r.teamName,
      ]),
    ),
  ];

  const body = lines.join("\n") + "\n";
  const dateStamp = new Date().toISOString().slice(0, 10);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="payments-${dateStamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
};
