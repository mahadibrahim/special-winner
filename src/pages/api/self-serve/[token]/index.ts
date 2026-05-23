/**
 * GET /api/self-serve/[token] → context payload for the self-serve page.
 *
 * Returns enough info for the page to render the greeting, event summary,
 * and outstanding-action checklist without an authenticated session.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { venues } from "@/lib/db/schema/teams";
import { locations } from "@/lib/db/schema/organizations";
import { verifyToken } from "@/lib/check-in/tokens-db";
import { resolveSigner } from "@/lib/check-in/resolve-signer";
import { formatEmailDateTime, DEFAULT_TIMEZONE } from "@/lib/email/format";

export const prerender = false;

const json = (b: unknown, s: number) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async ({ params }) => {
  const tokenValue = params.token;
  if (!tokenValue) return json({ error: "Token required" }, 400);

  const v = await verifyToken(tokenValue);
  if (!v.ok) {
    const status =
      v.reason === "expired" || v.reason === "consumed" ? 410 : 404;
    return json({ error: v.reason }, status);
  }
  const tok = v.token;

  const signer = await resolveSigner(tok.kind, tok.targetId);
  // walkin_session legitimately returns null from resolveSigner — the token
  // row carries contact info. All other kinds must resolve.
  if (!signer && tok.kind !== "walkin_session") {
    return json({ error: "Target gone" }, 410);
  }

  const db = getDb();
  let summary = "";
  // The space (venue) name — lets the completion screen say "head to X".
  let spaceName: string | null = null;
  const outstanding = { waiver: false, photo: false, payment: false };

  if (tok.kind === "drop_in_booking") {
    const [b] = await db
      .select({
        startsAt: dropInSessions.startsAt,
        venueName: venues.name,
        timezone: locations.timezone,
        sportLabel: dropInSessions.sportOrClassLabel,
        waiverSigned: dropInBookings.waiverSigned,
      })
      .from(dropInBookings)
      .innerJoin(dropInSessions, eq(dropInSessions.id, dropInBookings.sessionId))
      .innerJoin(venues, eq(venues.id, dropInSessions.venueId))
      .innerJoin(locations, eq(locations.id, venues.locationId))
      .where(eq(dropInBookings.id, tok.targetId))
      .limit(1);
    if (!b) return json({ error: "Booking gone" }, 410);
    summary = `${b.sportLabel} on ${formatEmailDateTime(b.startsAt, b.timezone ?? DEFAULT_TIMEZONE)} at ${b.venueName}`;
    spaceName = b.venueName;
    outstanding.waiver = !b.waiverSigned;
  } else if (tok.kind === "field_rental") {
    const [r] = await db
      .select({
        startsAt: fieldRentals.startsAt,
        venueName: venues.name,
        timezone: locations.timezone,
        waiverSigned: fieldRentals.waiverSigned,
      })
      .from(fieldRentals)
      .innerJoin(venues, eq(venues.id, fieldRentals.venueId))
      .innerJoin(locations, eq(locations.id, venues.locationId))
      .where(eq(fieldRentals.id, tok.targetId))
      .limit(1);
    if (!r) return json({ error: "Rental gone" }, 410);
    summary = `Field rental on ${formatEmailDateTime(r.startsAt, r.timezone ?? DEFAULT_TIMEZONE)} at ${r.venueName}`;
    spaceName = r.venueName;
    outstanding.waiver = !r.waiverSigned;
  } else if (tok.kind === "roster_entry") {
    summary = `Today's game`;
    outstanding.waiver = true;
  } else if (tok.kind === "walkin_session") {
    summary = `Walk-in registration`;
    outstanding.waiver = true;
    outstanding.payment = true;
  }

  return json(
    {
      tokenKind: tok.kind,
      displayName: signer?.displayName ?? "Guest",
      signerName: signer?.signerName ?? null,
      summary,
      spaceName,
      outstanding,
      expiresAt: tok.expiresAt,
    },
    200,
  );
};
