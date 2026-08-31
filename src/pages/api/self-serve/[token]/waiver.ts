/**
 * POST /api/self-serve/[token]/waiver
 *
 * Body: { acceptedName: string }
 *
 * Marks the waiver accepted on the underlying booking/rental row, then
 * records the canonical ANNUAL liability consent through
 * `recordLiabilityWaiver` whenever the token resolves to a `family_members`
 * person (see the write below for which kinds do).
 *
 * Every surface keeps its local `waiverSigned*` columns as a denormalized
 * audit copy; the `consents` row is what the platform-wide 365-day predicate
 * actually reads.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { fieldRentals, fieldRentalPlayers } from "@/lib/db/schema/field-rentals";
import { users } from "@/lib/db/schema/users";
import { verifyToken } from "@/lib/check-in/tokens-db";
import { resolveSigner, asSelfServiceKind } from "@/lib/check-in/resolve-signer";
import { resolvePerson } from "@/lib/registrations/resolve-person";
import { resolveActiveLiabilityWaiver } from "@/lib/consents/active-waiver";
import {
  hasValidLiabilityWaiver,
  recordLiabilityWaiver,
} from "@/lib/consents/liability";
import {
  waiverConsentVariant,
  waiverAssentSentence,
} from "@/lib/consents/waiver-consent-language";

export const prerender = false;

const json = (b: unknown, s: number) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ params, request, clientAddress }) => {
  const tokenValue = params.token;
  if (!tokenValue) return json({ error: "Token required" }, 400);

  const v = await verifyToken(tokenValue);
  if (!v.ok) {
    const status =
      v.reason === "expired" || v.reason === "consumed" ? 410 : 404;
    return json({ error: v.reason }, status);
  }
  const tok = v.token;
  // A marketing-consent token is not a waiver target.
  const kind = asSelfServiceKind(tok.kind);
  if (!kind) return json({ error: "not_found" }, 404);

  let body: { acceptedName?: string };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const acceptedName = (body.acceptedName ?? "").trim();
  if (acceptedName.length === 0) {
    return json({ error: "acceptedName is required" }, 422);
  }

  const now = new Date();
  const db = getDb();

  // Signing audit trail, taken from the REQUEST CONTEXT — never the body,
  // which the client controls. `clientAddress` is the adapter's own view of
  // the peer; the X-Forwarded-For fallback preserves what the rental-player
  // branch captured before this endpoint had a shared pair. Both `?? null`
  // rather than a placeholder: the columns are nullable and an honest NULL
  // beats a fake value.
  const signingIp =
    clientAddress ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;
  const signingUa = request.headers.get("user-agent") ?? null;

  // Resolve the signer ONCE, before writing — resolveSigner's isMinor is the
  // same signal WaiverCard used to pick the consent sentence, so the record
  // can persist which language was actually shown (#398). A resolution
  // failure falls back to the adult shape, mirroring resolve-signer's own
  // philosophy (and matching what the card would have rendered).
  let signer: Awaited<ReturnType<typeof resolveSigner>> = null;
  try {
    signer = await resolveSigner(kind, tok.targetId, tok.organizationId);
  } catch (err) {
    console.error("[self-serve.waiver] resolveSigner failed", err);
  }
  const consentVariant = waiverConsentVariant(signer?.isMinor ?? false);
  const consentText = waiverAssentSentence(
    consentVariant,
    signer?.displayName ?? undefined,
  );

  // Caller contract clause 3 for `recordLiabilityWaiver`: gate on the READ
  // helper. It is append-only and does not dedupe, so without this a double
  // submit (or a refreshed self-serve link) would append a second audit row
  // for the same person-year.
  //
  // Evaluated HERE, before the local row writes below, and NOT next to the
  // consent write further down: `hasValidLiabilityWaiver`'s transitional
  // fallback accepts a dated, signed `drop_in_bookings` row inside the
  // window — which is exactly what the drop-in branch is about to write. Ask
  // afterwards and every kiosk signature reports itself as already covered
  // and writes nothing.
  let waiverAlreadyOnFile = false;
  if (signer?.familyMemberId) {
    try {
      waiverAlreadyOnFile = await hasValidLiabilityWaiver(
        signer.familyMemberId,
        tok.organizationId,
        db,
      );
    } catch (err) {
      // Fail towards RECORDING what the person just signed — a redundant
      // consents row is harmless; a lost release is not.
      console.error("[self-serve.waiver] waiver validity lookup failed", err);
    }
  }

  // field_rental, first-time accounted renter: resolve-signer.ts's
  // field_rental branch deliberately does a READ-ONLY lookup for the
  // renter's self family_members row (it also backs a GET the self-serve
  // PayCard polls every ~2s, and a create-on-read would let concurrent
  // polls race duplicate self rows — see that file's doc comment). A POST
  // here is a one-shot, real signature event, so THIS is where a
  // never-rented-before renter's self row gets created. `familyMemberId`
  // being null here (with an account present) can ONLY mean "no row yet" —
  // if one existed, resolveSigner's read would have found it and
  // `waiverAlreadyOnFile` above would already be authoritative.
  if (
    tok.kind === "field_rental" &&
    signer &&
    !signer.familyMemberId &&
    signer.recipientUserId
  ) {
    try {
      const [u] = await db
        .select({
          firstName: users.firstName,
          lastName: users.lastName,
          birthDate: users.birthDate,
        })
        .from(users)
        .where(eq(users.id, signer.recipientUserId))
        .limit(1);
      if (u) {
        const person = await resolvePerson(db, {
          kind: "self",
          user: {
            id: signer.recipientUserId,
            firstName: u.firstName ?? "",
            lastName: u.lastName ?? "",
            birthDate: u.birthDate,
          },
        });
        signer = { ...signer, familyMemberId: person.id };
      }
    } catch (err) {
      // Best-effort: a lookup/create failure just means this signature
      // stays local-only (the fieldRentals waiver* columns below), same
      // degrade-to-adult-shape philosophy as resolveSigner itself.
      console.error("[self-serve.waiver] resolvePerson failed for renter", err);
    }
  }

  if (tok.kind === "drop_in_booking" || tok.kind === "walkin_session") {
    // NOTE — this stamps a DATED signature even when `waiverAlreadyOnFile`
    // is true. Reaching that state means the ask was served from a stale
    // page (or POSTed directly): build-context suppresses the WaiverCard for
    // a covered person, and walkin/start.ts now births covered holds already
    // stamped. It is an accepted narrow path, deliberately not collapsed
    // into the on-file shape — a human really did read and sign, and
    // recording that with its date is the honest audit entry. The cost is
    // that this row extends the transitional legacy fallback window past
    // the canonical consent's expiry; the fallback ages out on its own, and
    // the alternative (discarding a real signature's date) is worse.
    await db
      .update(dropInBookings)
      .set({
        waiverSigned: true,
        waiverSignedAt: now,
        waiverSignedBy: acceptedName,
        waiverConsentVariant: consentVariant,
        waiverConsentText: consentText,
        updatedAt: now,
      })
      .where(eq(dropInBookings.id, tok.targetId));
  } else if (tok.kind === "field_rental") {
    await db
      .update(fieldRentals)
      .set({
        waiverSigned: true,
        waiverSignedAt: now,
        waiverSignedBy: acceptedName,
        waiverConsentVariant: consentVariant,
        waiverConsentText: consentText,
        updatedAt: now,
      })
      .where(eq(fieldRentals.id, tok.targetId));
  } else if (tok.kind === "roster_entry") {
    // A roster entry has no signature columns of its own — the
    // registration-time waiver lives on `registrations`. There is nothing
    // local to stamp; the consent write below IS this branch's record, and
    // it always has a person (the registration's family member).
  } else if (tok.kind === "rental_player") {
    const waiver = await resolveActiveLiabilityWaiver(db, tok.organizationId);
    await db
      .update(fieldRentalPlayers)
      .set({
        status: "signed",
        signerName: acceptedName,
        waiverId: waiver?.id ?? null,
        contentHash: waiver?.contentHash ?? "v1-liability",
        signedAt: now,
        signedIp: signingIp,
        signedUa: signingUa,
      })
      .where(eq(fieldRentalPlayers.id, tok.targetId));
  }

  // Record the canonical ANNUAL liability consent for the person this token
  // resolves to. Replaces a hand-rolled `consents` insert that duplicated the
  // 365-day expiry inline and hardcoded a content hash — `recordConsent`
  // (behind the helper) resolves the org's live waiver document instead, and
  // shares the ONE definition of the validity window with the read side.
  //
  // LIMITATION — which kinds actually land a row:
  //   roster_entry, drop_in_booking / walkin_session booked for a MINOR, and
  //   field_rental for an ACCOUNTED renter all carry a `family_members`
  //   person — for field_rental, resolve-signer.ts's GET-safe read finds an
  //   EXISTING self row, and the block above this one resolvePerson()s a
  //   first-time renter's self row right here (this is the one-shot POST,
  //   not the polled GET, so create-on-write is safe). Adult drop-ins and
  //   adult walk-ins do not (walkin/start.ts creates the person row only
  //   for a minor); a GUEST (account-less) field_rental has no user to
  //   resolve a person from; and
  //   rental_player has no linkage at all — a rental player is a bare typed
  //   name + email, with no userId/family_member column to resolve (see
  //   the LIMITATION comment on createRentalPlayer in
  //   src/lib/rentals/players.ts). Those signatures are skipped here,
  //   silently: the local waiver* columns remain their audit record.
  try {
    if (signer?.familyMemberId && !waiverAlreadyOnFile) {
      await recordLiabilityWaiver(
        {
          familyMemberId: signer.familyMemberId,
          organizationId: tok.organizationId,
          // Null is fine: the helper falls back to the person's owning
          // account (parent, or self) — `signed_by_user_id` is NOT NULL,
          // while `signedByName` always keeps who actually signed.
          signedByUserId: signer.recipientUserId ?? tok.recipientUserId,
          signedByName: acceptedName,
          consentVariant,
          consentText,
          ipAddress: signingIp,
          userAgent: signingUa,
        },
        db,
      );
    }
  } catch (err) {
    // Audit-row failure must not block the user at a kiosk. Log and continue
    // — the local waiver* columns above already recorded the signature.
    console.error("[self-serve.waiver] consent record failed", err);
  }

  return json({ ok: true, waiverSignedAt: now.toISOString() }, 200);
};
