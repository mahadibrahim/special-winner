/**
 * GET  /api/admin/rentals/blocks?status=&locationId= → the Blocks tab list.
 * POST /api/admin/rentals/blocks                     → commit a block.
 *
 * POST maps createRentalBlock's result straight through: ok → 200, conflicts
 * → 409 naming every session that lost its slot, validation → 400. The commit
 * itself is all-or-nothing, so a 409 means nothing was written.
 */
import type { APIRoute } from "astro";
import { and, desc, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { fieldRentalBlocks } from "@/lib/db/schema/field-rental-blocks";
import { locations } from "@/lib/db/schema/organizations";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import {
  requireSameOrgLocation,
  requireSameOrgVenue,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";
import { validateCreateBlockBody, collectVenueIds } from "@/lib/rentals/blocks/validators";
import { loadBlockBuildContext } from "@/lib/rentals/blocks/context";
import { createRentalBlock } from "@/lib/rentals/blocks/create";

export const prerender = false;

const BLOCK_STATUSES = ["draft", "awaiting_deposit", "active", "completed", "cancelled"] as const;
type BlockStatus = (typeof BLOCK_STATUSES)[number];

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const toDate = (v: unknown): Date | null => {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  const url = new URL(context.request.url);
  const statusParam = url.searchParams.get("status");
  const locationIdParam = url.searchParams.get("locationId");

  if (statusParam && !BLOCK_STATUSES.includes(statusParam as BlockStatus)) {
    return json({ error: "Unknown status filter" }, 400);
  }
  if (locationIdParam) {
    const location = await requireSameOrgLocation(orgId, locationIdParam);
    if (!location.ok) return ownershipDeniedResponse();
  }

  const rows = await getDb()
    .select({
      id: fieldRentalBlocks.id,
      label: fieldRentalBlocks.label,
      renterName: fieldRentalBlocks.renterName,
      locationName: locations.name,
      brand: fieldRentalBlocks.brand,
      status: fieldRentalBlocks.status,
      totalCents: fieldRentalBlocks.totalCents,
      depositDueCents: fieldRentalBlocks.depositDueCents,
      balanceDueCents: fieldRentalBlocks.balanceDueCents,
      balanceDueAt: fieldRentalBlocks.balanceDueAt,
      balancePaidAt: fieldRentalBlocks.balancePaidAt,
      createdAt: fieldRentalBlocks.createdAt,
      sessionCount: sql<number>`count(${fieldRentals.id})`,
      firstSessionAt: sql<string | null>`min(${fieldRentals.startsAt})`,
      lastSessionAt: sql<string | null>`max(${fieldRentals.endsAt})`,
      paidCents: sql<number>`coalesce(sum(${fieldRentals.amountPaidCents}), 0)`,
    })
    .from(fieldRentalBlocks)
    .innerJoin(locations, eq(locations.id, fieldRentalBlocks.locationId))
    .leftJoin(
      fieldRentals,
      and(eq(fieldRentals.blockId, fieldRentalBlocks.id), ne(fieldRentals.status, "cancelled")),
    )
    .where(
      and(
        eq(fieldRentalBlocks.organizationId, orgId),
        statusParam ? eq(fieldRentalBlocks.status, statusParam as BlockStatus) : undefined,
        locationIdParam ? eq(fieldRentalBlocks.locationId, locationIdParam) : undefined,
      ),
    )
    .groupBy(fieldRentalBlocks.id, locations.name)
    .orderBy(desc(fieldRentalBlocks.createdAt));

  const now = Date.now();
  return json(
    {
      blocks: rows.map((r) => {
        const balanceDueAt = toDate(r.balanceDueAt);
        return {
          id: r.id,
          label: r.label,
          renterName: r.renterName,
          locationName: r.locationName,
          brand: r.brand,
          status: r.status,
          sessionCount: Number(r.sessionCount ?? 0),
          firstSessionAt: toDate(r.firstSessionAt)?.toISOString() ?? null,
          lastSessionAt: toDate(r.lastSessionAt)?.toISOString() ?? null,
          totalCents: r.totalCents,
          paidCents: Number(r.paidCents ?? 0),
          balanceDueCents: r.balanceDueCents,
          balanceDueAt: balanceDueAt?.toISOString() ?? null,
          overdue:
            r.status === "active" &&
            r.balancePaidAt === null &&
            balanceDueAt !== null &&
            balanceDueAt.getTime() < now,
        };
      }),
    },
    200,
  );
};

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  let raw: unknown;
  try {
    raw = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = validateCreateBlockBody(raw);
  if (!parsed.ok) return json({ error: parsed.error }, 400);
  const body = parsed.value;

  const location = await requireSameOrgLocation(orgId, body.locationId);
  if (!location.ok) return ownershipDeniedResponse();

  for (const venueId of collectVenueIds(body)) {
    const venue = await requireSameOrgVenue(orgId, venueId);
    if (!venue.ok || venue.row.locationId !== body.locationId) {
      return ownershipDeniedResponse();
    }
  }

  const ctx = await loadBlockBuildContext(orgId, body.locationId, body.brand);
  if (!ctx) return ownershipDeniedResponse();

  const result = await createRentalBlock({
    organizationId: orgId,
    locationId: body.locationId,
    brand: body.brand,
    label: body.label,
    renterUserId: body.renterUserId,
    renterName: body.renterName,
    renterEmail: body.renterEmail,
    renterPhone: body.renterPhone,
    partySize: body.partySize,
    purpose: body.purpose,
    notes: body.notes,
    // The org timezone is authoritative: a client-supplied zone would produce
    // instants the server never priced.
    pattern: { ...body.pattern, timeZone: ctx.timeZone },
    excludedKeys: body.excludedKeys,
    sessionOverrides: body.sessionOverrides,
    extraSessions: body.extraSessions,
    discount: body.discount,
    depositPct: body.depositPct,
    rateCard: {
      balanceDueLeadDays: ctx.rateCard.balanceDueLeadDays,
      blockHoldHours: ctx.rateCard.blockHoldHours,
      quoteMarkerTtlDays: ctx.rateCard.quoteMarkerTtlDays,
    },
    pricingContext: ctx.pricingContext,
    mode: body.mode,
    offlinePaymentMethod: body.offlinePaymentMethod,
    createdByUserId: auth.user.id,
  });

  if (!result.ok) {
    if (result.conflicts.length > 0) {
      return json({ error: result.error, conflicts: result.conflicts }, 409);
    }
    return json({ error: result.error, conflicts: [] }, 400);
  }

  // A reserve writes ledger holds only, so it has no block to link to.
  if (body.mode === "internal_reserve") {
    return json({ reserved: true, reservedCount: result.reservedCount ?? 0 }, 200);
  }

  return json({ blockId: result.blockId, sessionIds: result.sessionIds }, 200);
};
