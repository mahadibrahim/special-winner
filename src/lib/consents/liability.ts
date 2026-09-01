/**
 * Canonical annual liability waiver — the one place the platform decides
 * "has this person signed for this organization within the last year?", and
 * the one place a new signature is written.
 *
 * The rule (docs/superpowers/specs/2026-08-31-annual-waiver-unification-design.md):
 *
 * > A person has a valid liability waiver for an organization iff a
 * > `consents` row of type `liability` exists for their `family_members`
 * > row, scoped to that org, granted, with `expiresAt > now`.
 *
 * Plus a TRANSITION fallback so nobody who signed recently is re-asked at
 * cutover: a legacy `drop_in_bookings` or `registrations` signature row for
 * the same person, under the same org, inside the same 365-day window, also
 * satisfies. The fallback reads SIGNATURE rows only — `waiverSignedAt NOT
 * NULL`. Rows that merely carry `waiverSigned = true` with no timestamp are
 * derived copies (the classes engine stamps them on auto-booked sessions);
 * they have no date to anchor a window to and must never grant validity.
 *
 * Both fallbacks are deliberately transitional: as surfaces move to
 * `recordLiabilityWaiver` the consents table becomes self-sufficient and the
 * fallbacks age out on their own (every legacy signature is >365d old a year
 * after cutover, at which point the queries can be deleted).
 */
import { and, desc, eq, gt, isNotNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { consents } from "@/lib/db/schema/consents";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { familyMembers, registrations } from "@/lib/db/schema/registrations";
import { programs, seasons } from "@/lib/db/schema/programs";
import { locations } from "@/lib/db/schema/organizations";
import { LIABILITY_VALIDITY_DAYS, recordConsent } from "./record";

/**
 * How long one liability signature is good for.
 *
 * Re-exported from `./record`, NOT redeclared: `recordConsent` computes the
 * `expiresAt` this module's predicate then reads back. Two independent
 * literals would let the write-side expiry and the read-side window fork
 * silently on any future change.
 */
export const WAIVER_VALID_DAYS = LIABILITY_VALIDITY_DAYS;

/**
 * The `waiverSigned*` attribution every surface must stamp when a booking or
 * registration is covered by the person's ANNUAL waiver rather than by a
 * signature taken at that moment — the wording clause 3 of
 * `recordLiabilityWaiver`'s caller contract prescribes.
 *
 * ONLY for submissions that carry no signature of their own. A row that a
 * human really signed keeps the name they typed and the date they typed it,
 * whether or not they were already covered — see the table in clause 3.
 *
 * Lives here, with the contract it belongs to, because SEVERAL surfaces stamp
 * it (the classes engine's on-file branch in book-child.ts, the paid drop-in
 * door's webhook fulfillment, and further doors as they migrate). Two
 * independent literals would let the same semantic state render with two
 * different attributions on the roster and the dashboard.
 *
 * Its companion rule is that the local `waiverSignedAt` stays NULL on this
 * branch: `hasValidLiabilityWaiver`'s legacy fallbacks accept only DATED
 * signature rows, so a dated derived copy would let a booking renew the very
 * window it was derived from.
 */
export const WAIVER_ON_FILE_ATTRIBUTION = "On file (annual waiver)";

const DAY_MS = 24 * 60 * 60 * 1000;

/** A `getDb()` handle or a transaction handle from `db.transaction(...)`.
 *  Mirrors `src/lib/memberships/get-child-membership.ts`. */
type DbClient =
  | ReturnType<typeof getDb>
  | Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export interface LiabilityWaiverSignature {
  familyMemberId: string;
  organizationId: string;
  /** Null for guest/kiosk signers with no account of their own; the person's
   *  owning user (parent, or self) then stands in as the account of record —
   *  `consents.signed_by_user_id` is NOT NULL. `signedByName` always keeps
   *  the human who actually signed. */
  signedByUserId: string | null;
  signedByName: string;
  consentVariant: "adult" | "guardian";
  consentText: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  registrationId?: string | null;
  /**
   * Extra provenance appended to the generated `notes` string, for surfaces
   * where WHO operated the screen is part of the audit trail and is not
   * captured by any other column — the admin walk-up desk (`walk-up:
   * admin=<id>`) is the case this exists for, where `signedByUserId` is the
   * customer while a staff member did the typing. Never a substitute for the
   * variant/text the helper always records.
   */
  notes?: string | null;
}

/**
 * The oldest signature timestamp still inside the validity window.
 * Exported so callers that need to render "valid until" or filter in their
 * own query share this module's arithmetic instead of re-deriving 365d.
 */
export function waiverWindowStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - WAIVER_VALID_DAYS * DAY_MS);
}

/**
 * Record a liability signature as the canonical, org-scoped consents row
 * (365-day expiry, waiver id + content hash resolved from the org's current
 * waiver document, IP/UA audit).
 *
 * Callers keep writing their own local `waiver*` columns for audit
 * continuity — those are denormalized copies, no longer gates.
 *
 * CALLER CONTRACT
 * ---------------
 * 1. This function is APPEND-ONLY and does NOT dedupe. `consents` is an
 *    audit log: every call writes another row, each with its own signedAt,
 *    expiry, content hash and IP/UA. That is deliberate — collapsing two
 *    signatures into one row would destroy the evidence of the second.
 * 2. Therefore: call it ONCE PER FRESH SIGNATURE — i.e. only on the branch
 *    where a human actually just agreed to the waiver text. Never call it
 *    unconditionally on every booking/registration write.
 * 3. THE RULE: call this whenever — and only when — a human actually signed
 *    on THIS request. Not "when the person is uncovered". Coverage
 *    (`hasValidLiabilityWaiver`) decides whether to ASK; the signature
 *    decides what to RECORD. The two questions are independent, and every
 *    surface answers both:
 *
 *      signed on this request?   covered?    what you write
 *      ───────────────────────   ────────    ─────────────────────────────
 *      yes                       either      dated local columns naming the
 *                                            signer + ONE call to this
 *                                            function, ip/UA from the
 *                                            request context
 *      no                        yes         local `waiverSigned: true` with
 *                                            the WAIVER_ON_FILE_ATTRIBUTION
 *                                            stamp and `waiverSignedAt` NULL
 *                                            — a pure READ, no call here
 *      no                        no          nothing signed and nothing to
 *                                            stamp: ask, or refuse
 *
 *    Recording a signature the person did not need is right, not redundant:
 *    they read the release and typed their name, and overwriting that with an
 *    undated "On file" stamp files a legal record of an event that did not
 *    happen the way it is written down. Conversely the undated stamp on the
 *    no-signature row is load-bearing — a dated derived copy would let
 *    `hasValidLiabilityWaiver`'s legacy fallbacks renew the very window it
 *    was derived from.
 *
 *    Every surface that can receive a signature follows this: the rentals
 *    booking door, `create-registration` (via both API callers), the
 *    post-payment drop-in capture, registration completion, the admin walk-up
 *    desk, and the self-serve / kiosk endpoint. There are no exceptions left
 *    to remember.
 * 4. The one legitimate reason to skip a call is a REPLAY — the same signing
 *    event delivered twice (a double submit, a refreshed self-serve link, a
 *    retried POST). Detect it per TARGET ROW ("this booking already carries a
 *    signature"), never by asking whether the person is covered: coverage
 *    cannot tell a replay from a second real signature at a second door, and
 *    using it there is exactly the bug clause 3 exists to prevent.
 * 5. Pass your transaction handle as `dbOrTx` so the consent lands or rolls
 *    back with the booking/registration it belongs to.
 *
 * The `book-child.ts` fresh-signature branch is the reference shape: it
 * already separates "waiver on file" from "signature supplied in this
 * request", and only the latter path writes.
 */
export async function recordLiabilityWaiver(
  sig: LiabilityWaiverSignature,
  dbOrTx?: DbClient,
): Promise<void> {
  const db = dbOrTx ?? getDb();

  const signedByUserId =
    sig.signedByUserId ?? (await resolveOwningUserId(db, sig.familyMemberId));
  if (!signedByUserId) {
    // Can't happen through the app: family_members carries a CHECK that
    // exactly one of parent_user_id / self_user_id is set, so every person
    // has an owning account. Degrade to a no-op rather than 500 a checkout
    // if a hand-written row ever violates that — the caller's local waiver
    // columns still capture the signature.
    console.warn(
      `[liability] no owning user for family_member ${sig.familyMemberId}; skipped consents row`,
    );
    return;
  }

  await recordConsent({
    db,
    familyMemberId: sig.familyMemberId,
    organizationId: sig.organizationId,
    registrationId: sig.registrationId ?? null,
    type: "liability",
    signedByUserId,
    signedByName: sig.signedByName,
    ipAddress: sig.ipAddress ?? null,
    userAgent: sig.userAgent ?? null,
    notes: sig.notes
      ? `variant=${sig.consentVariant}; text=${sig.consentText}; ${sig.notes}`
      : `variant=${sig.consentVariant}; text=${sig.consentText}`,
  });
}

/**
 * Whether `familyMemberId` has a liability waiver on file for
 * `organizationId` that is still inside the 365-day window.
 *
 * Three indexed lookups, short-circuiting in order: the canonical consents
 * row first (the only one that will survive long-term, served by
 * `consents_liability_validity_idx`), then the two legacy signature
 * fallbacks (`drop_in_bookings_waiver_signature_idx`, and
 * `registrations_family_member_idx` for the registration join).
 *
 * NOTE on booking/registration STATUS: the fallbacks deliberately do not
 * filter it. A cancelled or no-showed booking, or a withdrawn registration,
 * still means a human signed a legal release on that date — cancelling
 * attendance does not retract the release. (Contrast the trial-uniqueness
 * check, which excludes cancelled rows on purpose: an unused trial should be
 * given back. Opposite question, opposite answer.)
 */
export async function hasValidLiabilityWaiver(
  familyMemberId: string,
  organizationId: string,
  dbOrTx?: DbClient,
): Promise<boolean> {
  const db = dbOrTx ?? getDb();
  const now = new Date();

  // 1. Canonical consents row. Served by consents_liability_validity_idx.
  //    Read the MOST RECENT liability row for this (person, org) and judge
  //    that one, rather than "any granted unexpired row" — a later
  //    revocation must win over the grant it supersedes (consents is an
  //    append-only log; this matches hasActiveConsent's semantics).
  const [consent] = await db
    .select({ status: consents.status, expiresAt: consents.expiresAt })
    .from(consents)
    .where(
      and(
        eq(consents.familyMemberId, familyMemberId),
        eq(consents.organizationId, organizationId),
        eq(consents.type, "liability"),
      ),
    )
    .orderBy(desc(consents.signedAt))
    .limit(1);
  if (consent && consent.status !== "granted") {
    // A REVOCATION is an affirmative "this person is not covered" and is
    // authoritative — it must not fall through to a legacy signature row
    // that predates it. Note the asymmetry with the expired case below: an
    // expired GRANT falls through on purpose, because a legacy signature
    // inside the window is a legitimate later renewal of the same consent.
    return false;
  }
  if (consent && consent.expiresAt && consent.expiresAt.getTime() > now.getTime()) {
    return true;
  }

  const cutoff = waiverWindowStart(now);

  // 2. Legacy drop-in / class booking signature. The org lives on the
  //    session, not the booking.
  const [booking] = await db
    .select({ one: sql<number>`1` })
    .from(dropInBookings)
    .innerJoin(dropInSessions, eq(dropInBookings.sessionId, dropInSessions.id))
    .where(
      and(
        eq(dropInBookings.familyMemberId, familyMemberId),
        eq(dropInSessions.organizationId, organizationId),
        eq(dropInBookings.waiverSigned, true),
        // Redundant against `gt` in SQL three-valued logic, but it is the
        // load-bearing rule (derived rows carry no signature date) — state it.
        isNotNull(dropInBookings.waiverSignedAt),
        gt(dropInBookings.waiverSignedAt, cutoff),
      ),
    )
    .limit(1);
  if (booking) return true;

  // 3. Legacy season/league/camp registration signature. `seasons` has no
  //    organizationId — the real path is registrations → seasons → programs
  //    → locations.organizationId (same join the 0139 backfill uses).
  const [registration] = await db
    .select({ one: sql<number>`1` })
    .from(registrations)
    .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(
      and(
        eq(registrations.familyMemberId, familyMemberId),
        eq(locations.organizationId, organizationId),
        eq(registrations.waiverSigned, true),
        isNotNull(registrations.waiverSignedAt),
        gt(registrations.waiverSignedAt, cutoff),
      ),
    )
    .limit(1);
  return Boolean(registration);
}

/**
 * When the person's CANONICAL liability consent for this org runs out, or null.
 *
 * Display-only — for surfaces that want to say "waiver on file, valid through
 * <date>" instead of re-asking. Never a gate: `hasValidLiabilityWaiver` is the
 * only predicate, and this deliberately answers null in cases where that
 * predicate answers true — a person covered solely by one of the two LEGACY
 * signature fallbacks has no consents row, and therefore no expiry to quote.
 * Callers must render a date-free fallback ("valid this year") for null rather
 * than treating it as "not covered".
 *
 * Reads exactly query 1 of `hasValidLiabilityWaiver` (most recent liability row
 * for the pair, judged on its own status) so the two can't disagree about which
 * row is authoritative.
 */
export async function liabilityWaiverValidUntil(
  familyMemberId: string,
  organizationId: string,
  dbOrTx?: DbClient,
): Promise<Date | null> {
  const db = dbOrTx ?? getDb();
  const [consent] = await db
    .select({ status: consents.status, expiresAt: consents.expiresAt })
    .from(consents)
    .where(
      and(
        eq(consents.familyMemberId, familyMemberId),
        eq(consents.organizationId, organizationId),
        eq(consents.type, "liability"),
      ),
    )
    .orderBy(desc(consents.signedAt))
    .limit(1);
  if (!consent || consent.status !== "granted" || !consent.expiresAt) return null;
  return consent.expiresAt.getTime() > Date.now() ? consent.expiresAt : null;
}

/** The user account that owns a person row: the parent (COPPA path) or the
 *  user themselves (adult self path). Exactly one is set. */
async function resolveOwningUserId(
  db: DbClient,
  familyMemberId: string,
): Promise<string | null> {
  const [person] = await db
    .select({
      parentUserId: familyMembers.parentUserId,
      selfUserId: familyMembers.selfUserId,
    })
    .from(familyMembers)
    .where(eq(familyMembers.id, familyMemberId))
    .limit(1);
  return person?.selfUserId ?? person?.parentUserId ?? null;
}
