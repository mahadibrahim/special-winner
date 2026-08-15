/**
 * GET /api/rentals/blocks/:token
 *
 * Public, token-addressed read of a rental block for the renter-facing quote
 * page. NO session required - block renters arrive from a text message and
 * never sign up. The token is the only credential, so the payload is an
 * explicit allow-list: internal notes, the generator pattern, and
 * createdByUserId never cross this boundary.
 *
 * 404 for an unknown token, 410 for one that has lapsed.
 */
import type { APIRoute } from "astro";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { organizations, locations } from "@/lib/db/schema/organizations";
import { venues } from "@/lib/db/schema/teams";
import { resolveBlockTokenResult, computeBlockOwed } from "@/lib/rentals/blocks/tokens";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async ({ params }) => {
  const token = params.token ?? "";
  const resolved = await resolveBlockTokenResult(token);
  if (!resolved.ok) {
    return json({ error: resolved.reason }, resolved.reason === "expired" ? 410 : 404);
  }
  const { block } = resolved;

  const db = getDb();
  const [org] = await db
    .select({
      timezone: organizations.timezone,
      locationName: locations.name,
      locationTimezone: locations.timezone,
    })
    .from(organizations)
    .leftJoin(locations, eq(locations.id, block.locationId))
    .where(eq(organizations.id, block.organizationId))
    .limit(1);

  const sessions = await db
    .select({
      id: fieldRentals.id,
      venueName: venues.name,
      fieldNumber: fieldRentals.fieldNumber,
      startsAt: fieldRentals.startsAt,
      endsAt: fieldRentals.endsAt,
      status: fieldRentals.status,
      amountDueCents: fieldRentals.amountDueCents,
    })
    .from(fieldRentals)
    .innerJoin(venues, eq(venues.id, fieldRentals.venueId))
    .where(eq(fieldRentals.blockId, block.id))
    .orderBy(asc(fieldRentals.startsAt));

  const owed = computeBlockOwed(block);

  return json(
    {
      block: {
        id: block.id,
        label: block.label,
        brand: block.brand,
        status: block.status,
        renterName: block.renterName,
        partySize: block.partySize,
        purpose: block.purpose,
        locationName: org?.locationName ?? null,
        subtotalCents: block.subtotalCents,
        discountKind: block.discountKind,
        discountValue: block.discountValue,
        totalCents: block.totalCents,
        depositDueCents: block.depositDueCents,
        depositPaidAt: block.depositPaidAt?.toISOString() ?? null,
        depositExpiresAt: block.depositExpiresAt?.toISOString() ?? null,
        balanceDueCents: block.balanceDueCents,
        balanceDueAt: block.balanceDueAt?.toISOString() ?? null,
        balancePaidAt: block.balancePaidAt?.toISOString() ?? null,
        cancelledAt: block.cancelledAt?.toISOString() ?? null,
      },
      sessions: sessions.map((s) => ({
        id: s.id,
        venueName: s.venueName,
        fieldNumber: s.fieldNumber,
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
        status: s.status,
        amountDueCents: s.amountDueCents,
      })),
      owed: {
        kind: owed.kind,
        cents: owed.cents,
        dueAt: owed.dueAt?.toISOString() ?? null,
      },
      timeZone: org?.locationTimezone ?? org?.timezone ?? "America/New_York",
    },
    200,
  );
};
