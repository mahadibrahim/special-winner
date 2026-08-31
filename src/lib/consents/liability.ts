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
import { recordConsent } from "./record";

/** How long one liability signature is good for. Matches the expiry
 *  `recordConsent` has always written for `type='liability'`. */
export const WAIVER_VALID_DAYS = 365;

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
    notes: `variant=${sig.consentVariant}; text=${sig.consentText}`,
  });
}

/**
 * Whether `familyMemberId` has a liability waiver on file for
 * `organizationId` that is still inside the 365-day window.
 *
 * Three cheap indexed lookups, short-circuiting in order: the canonical
 * consents row first (the only one that will survive long-term), then the
 * two legacy signature fallbacks.
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
  if (
    consent &&
    consent.status === "granted" &&
    consent.expiresAt &&
    consent.expiresAt.getTime() > now.getTime()
  ) {
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
