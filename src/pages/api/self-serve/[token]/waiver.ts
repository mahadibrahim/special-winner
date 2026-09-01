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
import { recordLiabilityWaiver } from "@/lib/consents/liability";
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

  // REPLAY GUARD — per TARGET ROW, not per person-year.
  //
  // This used to gate on `hasValidLiabilityWaiver`, i.e. on COVERAGE, which
  // threw away every signature by an already-covered person: a renter's second
  // visit, a kiosk minor's second session. Coverage gates the ASK (the
  // self-serve page suppresses the card for a covered person via
  // build-context); it must never decide whether a signature that DID happen
  // is recorded — clause 3 of `recordLiabilityWaiver`'s caller contract.
  //
  // What genuinely must not double-append is ONE signing event delivered
  // twice: this endpoint does not consume its token, so a double submit or a
  // refreshed link re-POSTs the same form. That is a property of the TARGET
  // ROW ("this booking/rental already carries a signature"), the same
  // idempotency `/api/dropin/bookings/[id]/waiver` applies, and it stays true
  // no matter how many other doors the person has signed at.
  //
  // Read BEFORE the local writes below, which are what would otherwise make
  // this answer itself yes.
  //
  // `roster_entry` has no local waiver columns at all (the registration-time
  // signature lives on `registrations` — see the LIMITATION note below), so
  // it has no row state to be idempotent against and always records. Two
  // submissions there append two rows; for an append-only log of signing
  // events that is accurate rather than wrong, and the game-day link is
  // one-per-game.
  // A DATED prior signature is the test, never the bare `waiverSigned` flag.
  // That flag is equally true on a row nobody signed: the rentals door births
  // a covered renter's booking stamped "On file (annual waiver)" with a NULL
  // date, and walkin/start.ts does the same for a covered kiosk hold. Reading
  // those as replays suppressed the append while the writes below went ahead
  // and DATED the row — manufacturing exactly the dated-local-row-with-no-
  // canonical-consent state this module calls a failure elsewhere. The date is
  // the discriminator clause 4 of the caller contract names: it is present
  // only when a human actually signed THIS row.
  let targetAlreadySigned = false;
  try {
    if (kind === "drop_in_booking" || kind === "walkin_session") {
      const [b] = await db
        .select({
          waiverSigned: dropInBookings.waiverSigned,
          waiverSignedAt: dropInBookings.waiverSignedAt,
        })
        .from(dropInBookings)
        .where(eq(dropInBookings.id, tok.targetId))
        .limit(1);
      targetAlreadySigned = b?.waiverSigned === true && b.waiverSignedAt !== null;
    } else if (kind === "field_rental") {
      const [r] = await db
        .select({
          waiverSigned: fieldRentals.waiverSigned,
          waiverSignedAt: fieldRentals.waiverSignedAt,
        })
        .from(fieldRentals)
        .where(eq(fieldRentals.id, tok.targetId))
        .limit(1);
      targetAlreadySigned = r?.waiverSigned === true && r.waiverSignedAt !== null;
    } else if (kind === "rental_player") {
      // `fieldRentalPlayers` has no on-file stamp — a player row only reaches
      // `signed` through this endpoint, which always dates it — but the date
      // is asserted anyway so the three branches state one rule.
      const [p] = await db
        .select({
          status: fieldRentalPlayers.status,
          signedAt: fieldRentalPlayers.signedAt,
        })
        .from(fieldRentalPlayers)
        .where(eq(fieldRentalPlayers.id, tok.targetId))
        .limit(1);
      targetAlreadySigned = p?.status === "signed" && p.signedAt !== null;
    }
  } catch (err) {
    // Fail towards RECORDING what the person just signed — a redundant
    // consents row is harmless; a lost release is not.
    console.error("[self-serve.waiver] replay lookup failed", err);
  }

  // field_rental, first-time accounted renter: resolve-signer.ts's
  // field_rental branch deliberately does a READ-ONLY lookup for the
  // renter's self family_members row (it also backs a GET the self-serve
  // PayCard polls every ~2s, and a create-on-read would let concurrent
  // polls race duplicate self rows — see that file's doc comment). A POST
  // here is a one-shot, real signature event, so THIS is where a
  // never-rented-before renter's self row gets created. `familyMemberId`
  // being null here (with an account present) can ONLY mean "no row yet" —
  // if one existed, resolveSigner's read would have found it.
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
    // A DATED signature, even for an already-covered participant. Reaching
    // that state means the ask was served from a stale page (or POSTed
    // directly): build-context suppresses the WaiverCard for a covered
    // person, and walkin/start.ts births covered holds already stamped
    // (`waiverSigned: true`, date NULL). A human really did read and sign,
    // and recording that with its date is the honest audit entry.
    //
    // The canonical `consents` append below runs for this same row — which is
    // true only because the replay guard tests the DATE, not the bare flag. A
    // guard on the flag alone would read that born-stamped hold as "already
    // signed", skip the append, and leave the dated row this statement writes
    // with no canonical consent behind it. The two records now agree by
    // construction.
    //
    // The residual cost is that this dated row extends the transitional legacy
    // fallback window past the canonical consent's expiry; the fallback ages
    // out on its own, and the alternative (discarding a real signature's date)
    // is worse.
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
  //
  // Written for EVERY signature this endpoint accepts, including one from a
  // person already covered by an earlier one — `targetAlreadySigned` is the
  // only suppressor, and it means "this same row was already signed", i.e. a
  // replay, not a second signing event.
  try {
    if (signer?.familyMemberId && !targetAlreadySigned) {
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
