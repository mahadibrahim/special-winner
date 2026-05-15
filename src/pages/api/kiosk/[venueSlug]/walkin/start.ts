/**
 * POST /api/kiosk/[venueSlug]/walkin/start
 *
 * Creates a walk-in registration slot for an adult or minor arriving at the
 * kiosk without a prior online booking. Flow:
 *
 *   1. requireKioskVenue(slug) — resolve venue + org
 *   2. Validate the target session (same venue, status=scheduled)
 *   3. Validate contact / parent fields; reject minors without parent info
 *   4. Create or find the booker user record (parent for minors, self for adults)
 *   5. For minors: create a family_members row (parent_user_id path)
 *   6. Resolve amountDueCents from session override or org rate card
 *   7. Insert a dropInBookings row in `pending_claim` status
 *      NOTE: drop_in_booking_status has no `pending_payment` value. We reuse
 *      `pending_claim` here to represent "booking exists but payment not yet
 *      completed". Semantically: the walk-in slot is "claimed" but pending
 *      finalization, which aligns with how the expire-pending-claims sweep
 *      eventually reclaims the slot if payment never completes.
 *      A follow-up migration should add a `pending_payment` enum value to
 *      make the walk-in state unambiguous.
 *   8. Mint a `walkin_session` self-service token pointing at the booking
 *   9. Return { token, url, bookingId, amountDueCents }
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings, dropInRateCard } from "@/lib/db/schema/drop-in";
import { users } from "@/lib/db/schema/users";
import { familyMembers } from "@/lib/db/schema/registrations";
import { requireKioskVenue } from "@/lib/check-in/kiosk-auth";
import { mintToken } from "@/lib/check-in/tokens-db";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

function computeAge(dobStr: string): number {
  const dob = new Date(dobStr);
  const now = new Date();
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dob.getUTCDate())) {
    age -= 1;
  }
  return age;
}

export const POST: APIRoute = async ({ params, request }) => {
  const slug = params.venueSlug ?? "";
  const venueResult = await requireKioskVenue(slug);
  if (!venueResult.ok) return venueResult.response;
  const { venue } = venueResult;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const sessionId = body.sessionId as string | undefined;
  const contact = body.contact as Record<string, unknown> | undefined;
  const parent = body.parent as Record<string, unknown> | undefined;

  // --- Validate required fields ---
  if (!sessionId) return json({ error: "sessionId is required" }, 422);
  if (!contact) return json({ error: "contact is required" }, 422);

  const contactFirstName = (contact.firstName as string | undefined)?.trim();
  const contactLastName = (contact.lastName as string | undefined)?.trim();
  const contactEmail = (contact.email as string | undefined)?.trim().toLowerCase();
  const contactPhone = (contact.phone as string | undefined)?.trim() ?? null;
  const contactDob = (contact.dob as string | undefined)?.trim();

  if (!contactFirstName) return json({ error: "contact.firstName is required" }, 422);
  if (!contactLastName) return json({ error: "contact.lastName is required" }, 422);
  if (!contactEmail) return json({ error: "contact.email is required" }, 422);
  if (!contactDob) return json({ error: "contact.dob is required" }, 422);

  // Validate dob format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(contactDob)) {
    return json({ error: "contact.dob must be YYYY-MM-DD" }, 422);
  }

  const age = computeAge(contactDob);
  const isMinor = age < 18;

  // For minors, parent fields are required
  const parentFirstName = (parent?.firstName as string | undefined)?.trim();
  const parentLastName = (parent?.lastName as string | undefined)?.trim();
  const parentEmail = (parent?.email as string | undefined)?.trim().toLowerCase();
  const parentPhone = (parent?.phone as string | undefined)?.trim() ?? null;

  if (isMinor) {
    if (!parentFirstName) return json({ error: "parent.firstName is required for minors" }, 422);
    if (!parentLastName) return json({ error: "parent.lastName is required for minors" }, 422);
    if (!parentEmail) return json({ error: "parent.email is required for minors" }, 422);
  }

  const db = getDb();

  // --- Validate session ---
  const [session] = await db
    .select()
    .from(dropInSessions)
    .where(eq(dropInSessions.id, sessionId))
    .limit(1);

  if (!session) return json({ error: "Session not found" }, 404);
  if (session.venueId !== venue.id) return json({ error: "Session not at this venue" }, 422);
  if (session.status !== "scheduled") return json({ error: "Session is not open for registration" }, 422);

  // --- Resolve rate ---
  let [rateCard] = await db
    .select()
    .from(dropInRateCard)
    .where(eq(dropInRateCard.organizationId, venue.organizationId))
    .limit(1);
  if (!rateCard) {
    // Ensure a rate card exists (upsert)
    await db
      .insert(dropInRateCard)
      .values({ organizationId: venue.organizationId })
      .onConflictDoNothing();
    [rateCard] = await db
      .select()
      .from(dropInRateCard)
      .where(eq(dropInRateCard.organizationId, venue.organizationId))
      .limit(1);
  }
  const amountDueCents =
    session.sessionRateCents ?? rateCard?.defaultSessionRateCents ?? 1500;

  // --- Create or find booker user ---
  // For adults: contact IS the booker.
  // For minors: parent is the booker; contact info (name + dob) goes on family_members.
  const bookerEmail = isMinor ? parentEmail! : contactEmail;
  const bookerFirstName = isMinor ? parentFirstName! : contactFirstName;
  const bookerLastName = isMinor ? parentLastName! : contactLastName;
  const bookerPhone = isMinor ? parentPhone : contactPhone;

  let [existingUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, bookerEmail))
    .limit(1);

  let bookerUserId: string;
  if (existingUser) {
    bookerUserId = existingUser.id;
  } else {
    const [newUser] = await db
      .insert(users)
      .values({
        email: bookerEmail,
        firstName: bookerFirstName,
        lastName: bookerLastName,
        phone: bookerPhone,
        emailVerified: false,
        phoneVerified: false,
      })
      .returning({ id: users.id });
    bookerUserId = newUser.id;
  }

  // --- For minors: create family_members row (parentUserId path) ---
  if (isMinor) {
    // Check if this child already exists under this parent (by name + dob, case-insensitive)
    const existingChildren = await db
      .select()
      .from(familyMembers)
      .where(eq(familyMembers.parentUserId, bookerUserId));

    const normalName = (s: string) => s.toLowerCase().trim();
    const existing = existingChildren.find(
      (fm) =>
        normalName(fm.firstName) === normalName(contactFirstName) &&
        normalName(fm.lastName) === normalName(contactLastName) &&
        fm.birthDate === contactDob,
    );

    if (!existing) {
      await db.insert(familyMembers).values({
        parentUserId: bookerUserId,
        firstName: contactFirstName,
        lastName: contactLastName,
        birthDate: contactDob,
      });
    }
  }

  // --- Insert drop_in_bookings in pending_claim status ---
  // STATUS CHOICE: We reuse `pending_claim` (no `pending_payment` enum value exists).
  // See module-level comment for rationale. The expire-pending-claims sweep
  // handles cleanup if payment never completes.
  const [booking] = await db
    .insert(dropInBookings)
    .values({
      sessionId: session.id,
      userId: bookerUserId,
      status: "pending_claim",
      source: "walk_up",
      paymentMethod: "card_online",
      amountPaidCents: 0,
    })
    .returning();

  // --- Mint self-service token ---
  const recipientEmail = bookerEmail;
  const recipientPhone = bookerPhone ?? null;
  const appUrl = import.meta.env.PUBLIC_APP_URL ?? "http://localhost:4321";

  const tok = await mintToken({
    kind: "walkin_session",
    targetId: booking.id,
    organizationId: venue.organizationId,
    venueId: venue.id,
    sentVia: "kiosk_search",
    recipientUserId: bookerUserId,
    recipientEmail,
    recipientPhone,
    createdByUserId: null,
    ttlHours: 2, // Walk-in token expires in 2h — shorter TTL than the default 6h
  });

  return json(
    {
      token: tok.token,
      url: `${appUrl}/self-serve/${tok.token}`,
      bookingId: booking.id,
      amountDueCents,
    },
    200,
  );
};
