/**
 * addWalkUpToPickup
 *
 * Rapid roll-call entry point for Pickup Mode. Given a first name, last name,
 * and phone number, this function:
 *
 *   1. Finds an existing `users` row by normalized phone, or creates a phone-only
 *      stub user (email generated as `phone-<digits>@stub.aspiresports.com`).
 *   2. Calls `resolvePerson({kind:"self"})` to ensure a `family_members` row
 *      exists for the user.
 *   3. If a confirmed booking for `(sessionId, userId)` already exists, returns
 *      it without inserting a duplicate (idempotent for re-scans of the same phone).
 *   4. Otherwise inserts a CONFIRMED `drop_in_bookings` row with
 *      `checkedInAt = nowIso` and `source = "walk_up"`.
 *   5. Attempts to mint a self-service token and SMS the waiver+pay link to the
 *      user's phone. Failure is swallowed — the person is added regardless.
 *
 * Phone-only stub notes:
 * - `users.email` is NOT NULL UNIQUE. We synthesise a deterministic placeholder:
 *   `phone-<10digits>@stub.aspiresports.com`. If a stub already exists at that
 *   email, `onConflictDoNothing` returns it. The normalized-phone lookup
 *   (`users.phone` column) supersedes the email lookup for deduplication.
 * - `resolvePerson` requires a `birthDate`. For adult walk-ups where no DOB is
 *   collected, we use the sentinel "1900-01-01". This is consistent with how
 *   pickup mode treats adults: no age verification at the door.
 */
import { asc, and, eq, sql } from "drizzle-orm";
import type { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { users } from "@/lib/db/schema/users";
import { userOrganizationAccess } from "@/lib/db/schema/organizations";
import { normalizePhone } from "@/lib/venue/normalize-phone";
import { resolvePerson } from "@/lib/registrations/resolve-person";
import { mintToken } from "@/lib/check-in/tokens-db";
import { sendSms, normalizeUsPhone } from "@/lib/sms/send";
import { ADULT_SENTINEL_DOB } from "@/lib/person/dob";

// Accept both the top-level db handle and a transaction handle.
type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Database = Db | Tx;

export interface AddWalkUpInput {
  sessionId: string;
  firstName: string;
  lastName: string;
  /** Raw phone as typed by the admin (e.g. "(614) 555-1212"). */
  phone: string;
  /** Organization id — used to scope the self-service token + SMS. */
  orgId: string;
  /** Admin user id that triggered the add — used as `createdByUserId` on the token. */
  actorUserId: string;
  /** ISO timestamp for `checkedInAt` on the booking (pass `new Date().toISOString()`). */
  nowIso: string;
}

export interface LinkResult {
  sent: boolean;
  channel?: string;
  recipientMasked?: string;
}

export interface AddWalkUpResult {
  bookingId: string;
  personName: string;
  userId: string;
  linkResult: LinkResult;
}

export async function addWalkUpToPickup(
  db: Database,
  input: AddWalkUpInput,
): Promise<AddWalkUpResult> {
  const { sessionId, firstName, lastName, phone, orgId, actorUserId, nowIso } =
    input;

  const normalizedDigits = normalizePhone(phone); // e.g. "6145551212"
  const stubEmail = `phone-${normalizedDigits}@stub.aspiresports.com`;

  // ---- 1. Find or create user ----------------------------------------
  // Phone match is scoped to users already associated with THIS org via
  // userOrganizationAccess. This prevents cross-org user reuse: a phone
  // registered only at another org won't be attached here. The join +
  // orderBy(createdAt) satisfies the multi-tenant determinism rule
  // (shared CI DB may have multiple matching rows without an order).
  //
  // When we create a new stub, we also insert a userOrganizationAccess row
  // (role "parent") so the NEXT walk-up with the same phone dedupes in-org.
  let userId: string;
  let userPhone: string | null;

  const [byPhone] = await db
    .select({ id: users.id, phone: users.phone })
    .from(users)
    .innerJoin(
      userOrganizationAccess,
      and(
        eq(userOrganizationAccess.userId, users.id),
        eq(userOrganizationAccess.organizationId, orgId),
      ),
    )
    .where(
      sql`regexp_replace(${users.phone}, '[^0-9]', '', 'g') = ${normalizedDigits}`,
    )
    .orderBy(asc(users.createdAt))
    .limit(1);

  if (byPhone) {
    userId = byPhone.id;
    userPhone = byPhone.phone;
  } else {
    // Create a stub: use onConflictDoNothing in case two concurrent adds race
    // on the same stub email, then re-fetch if insert returns empty.
    const inserted = await db
      .insert(users)
      .values({
        email: stubEmail,
        firstName,
        lastName,
        phone,
        emailVerified: false,
        phoneVerified: false,
      })
      .onConflictDoNothing()
      .returning({ id: users.id, phone: users.phone });

    if (inserted.length > 0) {
      userId = inserted[0].id;
      userPhone = inserted[0].phone;
    } else {
      // Conflict raced — fetch the existing stub row by email (globally unique).
      const [existingStub] = await db
        .select({ id: users.id, phone: users.phone })
        .from(users)
        .where(eq(users.email, stubEmail))
        .limit(1);
      userId = existingStub.id;
      userPhone = existingStub.phone;
    }

    // Associate the stub (or race-winner) with this org so the next walk-up
    // with the same phone dedupes via the in-org phone lookup above.
    await db
      .insert(userOrganizationAccess)
      .values({
        userId,
        organizationId: orgId,
        role: "parent",
        active: true,
      })
      .onConflictDoNothing();
  }

  // ---- 2. Ensure family_members row (self path) ----------------------
  await resolvePerson(db, {
    kind: "self",
    user: {
      id: userId,
      firstName,
      lastName,
      birthDate: ADULT_SENTINEL_DOB,
    },
  });

  // ---- 3. Dedupe: return existing confirmed booking if present --------
  const [existingBooking] = await db
    .select({ id: dropInBookings.id })
    .from(dropInBookings)
    .where(
      and(
        eq(dropInBookings.sessionId, sessionId),
        eq(dropInBookings.userId, userId),
        sql`${dropInBookings.status} IN ('confirmed', 'waitlisted', 'pending_claim')`,
      ),
    )
    .limit(1);

  const personName = `${firstName} ${lastName}`.trim();

  if (existingBooking) {
    // Already added — return idempotently without re-sending link.
    return {
      bookingId: existingBooking.id,
      personName,
      userId,
      linkResult: { sent: false },
    };
  }

  // ---- 4. Insert CONFIRMED booking with checkedInAt = now ------------
  const [booking] = await db
    .insert(dropInBookings)
    .values({
      sessionId,
      userId,
      status: "confirmed",
      source: "walk_up",
      paymentMethod: "card_online",
      amountPaidCents: 0,
      checkedInAt: new Date(nowIso),
      teamAssignment: null,
      brand: "aspire",
    })
    .returning({ id: dropInBookings.id });

  const bookingId = booking.id;

  // ---- 5. Attempt waiver+pay link send (failure swallowed) -----------
  const linkResult: LinkResult = await sendWaiverLink({
    bookingId,
    orgId,
    actorUserId,
    userPhone,
  }).catch(() => ({ sent: false }));

  return { bookingId, personName, userId, linkResult };
}

// ---------------------------------------------------------------------------
// Internal: mint token + send SMS. Mirrors send-link.ts logic for
// kind="drop_in_booking". Returns a LinkResult; any throw is caught by the
// caller's try/catch.
// ---------------------------------------------------------------------------
async function sendWaiverLink(opts: {
  bookingId: string;
  orgId: string;
  actorUserId: string;
  userPhone: string | null;
}): Promise<LinkResult> {
  const { bookingId, orgId, actorUserId, userPhone } = opts;

  if (!userPhone) return { sent: false };

  const e164 = normalizeUsPhone(userPhone);
  if (!e164) return { sent: false };

  const token = await mintToken({
    kind: "drop_in_booking",
    targetId: bookingId,
    organizationId: orgId,
    venueId: null,
    sentVia: "sms",
    recipientUserId: null,
    recipientEmail: null,
    recipientPhone: userPhone,
    createdByUserId: actorUserId,
  });

  const appUrl = import.meta.env.PUBLIC_APP_URL ?? "http://localhost:4321";
  const url = `${appUrl}/self-serve/${token.token}`;

  // This booking is inserted as CONFIRMED (step 4 above) with no payment
  // step in the pickup flow — copy must not claim "payment" is outstanding.
  // Mirrors the non-pay-link copy in send-link.ts's isPayLink split.
  const smsResult = await sendSms({
    to: e164,
    body: `Finish your Aspire Sports pickup booking (waiver + photo): ${url}`,
    organizationId: orgId,
  });

  if (!smsResult.ok) {
    return { sent: false };
  }

  // Mask last-4 visible: +1 (614) *** → (614) ***-1212 style
  const masked = e164.replace(/(\+1)(\d{3})(\d{3})(\d{4})/, "($2) ***-$4");
  return { sent: true, channel: "sms", recipientMasked: masked };
}
