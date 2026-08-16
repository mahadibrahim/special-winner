/**
 * POST /api/admin/rentals/blocks/generate-preview
 *
 * Pattern → priced session list, with a conflict reason on every session the
 * ledger already claims and a "also quoted to X" marker where a competing
 * draft is holding the same slot. Persists NOTHING: the builder calls this on
 * every edit, and the authoritative conflict check runs inside the create
 * transaction.
 */
import type { APIRoute } from "astro";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import {
  requireSameOrgLocation,
  requireSameOrgVenue,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";
import { validateCreateBlockBody, collectVenueIds } from "@/lib/rentals/blocks/validators";
import { loadBlockBuildContext, findLedgerConflicts } from "@/lib/rentals/blocks/context";
import { resolveSessionList, resolveVenueFieldNumbers } from "@/lib/rentals/blocks/create";
import { quoteBlock, balanceDueAt } from "@/lib/rentals/blocks/pricing";
import { findCompetingQuotes, type MarkerSlot } from "@/lib/rentals/blocks/quote-markers";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

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

  // The org timezone is authoritative for local-time arithmetic; a client that
  // sent a different zone would otherwise generate instants the server never
  // priced.
  const sessions = resolveSessionList({
    pattern: { ...body.pattern, timeZone: ctx.timeZone },
    excludedKeys: body.excludedKeys,
    sessionOverrides: body.sessionOverrides,
    extraSessions: body.extraSessions,
  });
  if (sessions.length === 0) {
    return json(
      {
        sessions: [],
        subtotalCents: 0,
        discountCents: 0,
        totalCents: 0,
        depositDueCents: 0,
        balanceDueCents: 0,
        balanceDueAt: null,
      },
      200,
    );
  }

  const fieldNumbers = await resolveVenueFieldNumbers(sessions.map((s) => s.venueId));
  const quote = quoteBlock(sessions, ctx.pricingContext, {
    discount: body.discount,
    depositPct: body.depositPct,
  });

  const slots: MarkerSlot[] = quote.sessions.map((s) => ({
    venueId: s.venueId,
    fieldNumber: fieldNumbers[s.venueId] ?? 1,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
  }));

  const conflicts = await findLedgerConflicts(
    quote.sessions.map((s) => ({
      key: s.key,
      venueId: s.venueId,
      fieldNumber: fieldNumbers[s.venueId] ?? 1,
      startsAt: s.startsAt,
      endsAt: s.endsAt,
    })),
  );
  // A reopened draft still holds quote markers on its own slots. Without this
  // exclusion every re-preview reports the draft as competing with itself,
  // which reads as "someone else has quoted this" on every single row.
  const competing = await findCompetingQuotes(slots, body.draftBlockId ?? undefined);

  const venueNames = new Map(ctx.venues.map((v) => [v.id, v.name]));

  return json(
    {
      sessions: quote.sessions.map((s) => {
        const quoted = competing.get(`${s.venueId}|${s.startsAt.toISOString()}`);
        const reason = conflicts.get(s.key);
        return {
          key: s.key,
          date: s.date,
          venueId: s.venueId,
          venueName: venueNames.get(s.venueId) ?? "Field",
          fieldNumber: fieldNumbers[s.venueId] ?? 1,
          startsAt: s.startsAt.toISOString(),
          endsAt: s.endsAt.toISOString(),
          startMinute: s.startMinute,
          durationMinutes: s.durationMinutes,
          rateCardCents: s.rateCardCents,
          allocatedCents: s.allocatedCents,
          conflict: reason ? { reason } : null,
          competingQuote: quoted
            ? { label: quoted.label, quotedAt: quoted.quotedAt.toISOString() }
            : null,
        };
      }),
      subtotalCents: quote.subtotalCents,
      discountCents: quote.discountCents,
      totalCents: quote.totalCents,
      depositDueCents: quote.depositDueCents,
      balanceDueCents: quote.balanceDueCents,
      balanceDueAt: balanceDueAt(
        quote.sessions[0].startsAt,
        ctx.rateCard.balanceDueLeadDays,
      ).toISOString(),
      rateCard: {
        depositPct: ctx.rateCard.depositPct,
        balanceDueLeadDays: ctx.rateCard.balanceDueLeadDays,
        blockHoldHours: ctx.rateCard.blockHoldHours,
        quoteMarkerTtlDays: ctx.rateCard.quoteMarkerTtlDays,
      },
      timeZone: ctx.timeZone,
    },
    200,
  );
};
