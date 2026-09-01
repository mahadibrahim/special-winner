/**
 * Class pricing + eligibility for the WALK-UP surfaces.
 *
 * `POST /api/dropin/bookings` already enforces this rule for the ONLINE paid
 * child door (see its `familyMemberId` block): a `kind='class'` session is
 * priced from the SESSION's own rates — copied down from its class-slot
 * template by the materialization cron — and never from the org's
 * `drop_in_rate_card`, which is the ADULT PICKUP price list. The four
 * walk-up surfaces (kiosk `walkin/start`, kiosk `walkin/payment`, the
 * self-serve token context, and the front-desk admin walk-up) used to route
 * EVERY session through `resolveRate` + that card, so a kid walked into a
 * class at the desk was quoted an adult pickup drop-in price nobody
 * configured. This module is the shared half of the fix.
 *
 * Two rules, both mirroring the online door exactly:
 *
 *   1. PRICE — `session.sessionRateCents`, or `session.memberRateCents` when
 *      the participating CHILD holds an active membership. The BOOKER's own
 *      adult membership is irrelevant to a child's class and must never
 *      discount it (that is the whole reason this doesn't go through
 *      `resolveRate`). A null rate is a configuration error, surfaced as
 *      409 `class_rate_not_configured` by the caller via
 *      `classRateNotConfigured` — never a rate-card fallback.
 *
 *   2. ELIGIBILITY — a class walk-up must name a CHILD (a `family_members`
 *      row on the booking), and that child must pass the class-slot
 *      template's age gate. Adult-self walk-ups into a kids' class are
 *      refused with the same `class_requires_child` code the online door
 *      uses.
 *
 * SCOPE: `kind='class'` only. Callers must establish the kind before calling
 * — pickup sessions keep the `resolveRate` + rate-card path byte-for-byte.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classSlotTemplates } from "@/lib/db/schema/classes";
import { getActiveChildMembership } from "@/lib/memberships/get-child-membership";
import { isAgeIneligible } from "./enrollment";
import type { ClassRateNeed } from "./class-rate";

type DbClient =
  | ReturnType<typeof getDb>
  | Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/** Machine-readable code for "a class was booked without naming a child".
 *  Shared with `POST /api/dropin/bookings`'s inverse guard so the online and
 *  walk-up doors speak one vocabulary. */
export const CLASS_REQUIRES_CHILD = "class_requires_child";

/** Copy for the online (developer-facing) door — the client passes a
 *  `familyMemberId`, so the message names the field. */
export const CLASS_REQUIRES_CHILD_MESSAGE =
  "Class sessions must be booked for a child (familyMemberId required)";

/** Copy for the front desk / kiosk, where nobody is passing an id — the
 *  attendant is looking at a screen and needs to know what to do instead. */
export const CLASS_REQUIRES_CHILD_DESK_MESSAGE =
  "This is a kids' class — register the child with a parent or guardian, not an adult.";

/** Machine-readable code for a child outside the class's age range. Same
 *  string the enrollment/booking engines use (`EnrollmentError`,
 *  `ChildBookingError`). */
export const CLASS_AGE_INELIGIBLE = "age_ineligible";

export const CLASS_AGE_INELIGIBLE_MESSAGE =
  "This child is outside this class's age range.";

export type ClassWalkUpRateResult =
  | { ok: true; amountCents: number; membershipId: string | null }
  /** The rate the participant needed is null on the session — the caller
   *  returns `classRateNotConfigured(session, need, …)`. */
  | { ok: false; need: ClassRateNeed };

/**
 * The price a class walk-up (or a class session's public quote) owes,
 * derived from the SESSION only.
 *
 * Member rate applies ONLY when the CHILD (`familyMemberId`) holds an
 * `active` membership — the same server-verified test as the online paid
 * make-up door, never a claim from the client and never the booking
 * parent's own adult membership. No active child membership → the plain
 * public class rate.
 *
 * `familyMemberId` is nullable: pass `null` when no participant is known
 * yet (e.g. an anonymous or not-yet-booked viewer on the public session
 * detail page) — the membership lookup is skipped entirely and the result
 * is always the plain public class rate, the same answer as passing a
 * childless family member would give, without the wasted query.
 *
 * There is deliberately no `?? rateCard.*` tail anywhere in here: see the
 * module doc and src/lib/classes/class-rate.ts.
 */
export async function resolveClassWalkUpRate(
  session: {
    organizationId: string;
    sessionRateCents: number | null;
    memberRateCents: number | null;
  },
  familyMemberId: string | null,
  dbOrTx?: DbClient,
): Promise<ClassWalkUpRateResult> {
  const childMembership = familyMemberId
    ? await getActiveChildMembership(familyMemberId, session.organizationId, dbOrTx)
    : null;
  const activeChildMembership =
    childMembership && childMembership.status === "active" ? childMembership : null;

  const amountCents = activeChildMembership
    ? session.memberRateCents
    : session.sessionRateCents;
  if (amountCents === null) {
    return { ok: false, need: activeChildMembership ? "member" : "session" };
  }

  return {
    ok: true,
    amountCents,
    membershipId: activeChildMembership?.id ?? null,
  };
}

/**
 * Whether the child is outside the age range of the class-slot template the
 * session was materialized from.
 *
 * Anchored on the SESSION's `startsAt` (how old the child will be at that
 * class), matching the per-session gate in `createChildClassBooking` rather
 * than enrollment's "how old are they now" — a walk-up buys one specific
 * session, so that session's date is the honest reference.
 *
 * Skipped — returns false — for a hand-made class session with no template,
 * a template with no min/max, or a child with no DOB on file. Identical
 * conditions to `isAgeIneligible`, which does the actual comparison.
 */
export async function isClassWalkUpAgeIneligible(
  session: { classSlotTemplateId: string | null; startsAt: Date },
  birthDate: string | null,
  dbOrTx?: DbClient,
): Promise<boolean> {
  if (!session.classSlotTemplateId || !birthDate) return false;
  const db = dbOrTx ?? getDb();
  const [template] = await db
    .select({
      minAge: classSlotTemplates.minAge,
      maxAge: classSlotTemplates.maxAge,
    })
    .from(classSlotTemplates)
    .where(eq(classSlotTemplates.id, session.classSlotTemplateId))
    .limit(1);
  if (!template) return false;
  return isAgeIneligible(template, birthDate, session.startsAt);
}
