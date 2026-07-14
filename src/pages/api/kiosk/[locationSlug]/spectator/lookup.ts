/**
 * GET /api/kiosk/[locationSlug]/spectator/lookup?q=<digits>
 *
 * "Have I already signed this year?" — the returning-spectator fast path.
 *
 * PRIVACY. This kiosk is a public, unattended iPad in a lobby. It matches on
 * PHONE DIGITS ONLY, minimum 4 — never a name. A name-prefix search on this
 * device previously let whoever was standing there enumerate strangers'
 * bookings (see the booking search, /api/kiosk/[locationSlug]/search); the fix
 * was phone-only matching and it must not be reintroduced here. The response
 * carries the first name and the validity date and nothing else: enough for a
 * returning spectator to recognise themselves, not enough for a stranger who
 * guessed four digits to learn a surname.
 */
import type { APIRoute } from "astro";
import { and, desc, eq, gt, ilike } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { spectatorWaivers } from "@/lib/db/schema/spectators";
import { requireKioskLocation } from "@/lib/check-in/kiosk-auth";

export const prerender = false;

const json = (b: unknown, s: number) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async ({ params, url, locals }) => {
  const k = await requireKioskLocation(
    params.locationSlug ?? "",
    locals.organization?.id ?? null,
  );
  if (!k.ok) return k.response;

  // Digits extracted from the whole string, so "Casey 1234" cannot become a
  // name query by riding along with a suffix.
  const digits = (url.searchParams.get("q") ?? "").replace(/\D/g, "");
  if (digits.length < 4) return json({ found: false }, 200);

  const [row] = await getDb()
    .select({
      firstName: spectatorWaivers.firstName,
      validUntil: spectatorWaivers.validUntil,
    })
    .from(spectatorWaivers)
    .where(
      and(
        eq(spectatorWaivers.organizationId, k.location.organizationId),
        ilike(spectatorWaivers.phone, `%${digits.slice(-4)}`),
        gt(spectatorWaivers.validUntil, new Date()),
      ),
    )
    // Multi-tenant hazard (CLAUDE.md): the shared DB accumulates rows, so a
    // last-4 match can hit several. Newest valid waiver wins, deterministically.
    .orderBy(desc(spectatorWaivers.signedAt))
    .limit(1);

  if (!row) return json({ found: false }, 200);
  return json({ found: true, firstName: row.firstName, validUntil: row.validUntil }, 200);
};
