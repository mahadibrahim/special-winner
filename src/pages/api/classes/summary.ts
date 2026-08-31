/**
 * GET /api/classes/summary
 *
 * Authed parent endpoint — one round trip for Plan 3's per-child dashboard
 * cards. For every child of the caller (`family_members.parent_user_id`)
 * returns their class membership, standing enrollment, next upcoming
 * confirmed session, and whether they've used their org trial class.
 *
 * Query shape is bounded, not per-child-looped:
 * - children fetched once
 * - enrollment / next-session / trial-used are each ONE batched query keyed
 *   by `inArray(familyMemberId, childIds)`, merged in JS by child id
 * - `getActiveChildMembership`, `getCreditBalances` and
 *   `hasValidLiabilityWaiver` are the exceptions — each is single-child by
 *   design (see their doc comments) and re-implementing their business rules
 *   here as a batch query would fork the rule. Families are small in
 *   practice, so this file caps at `MAX_CHILDREN` and calls each once per
 *   child, in parallel.
 *
 * `hasWaiverOnFile` is the ANNUAL validity predicate, not "has ever signed" —
 * see the call site. There is deliberately no `hasEverBooked` flag: it existed
 * only to stop the dashboard nudging a veteran family, which is precisely the
 * family an expiring waiver now has to nudge.
 */
import type { APIRoute } from "astro";
import { and, asc, desc, eq, gt, inArray, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { familyMembers } from "@/lib/db/schema/registrations";
import { classEnrollments, classSlotTemplates } from "@/lib/db/schema/classes";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { getActiveChildMembership } from "@/lib/memberships/get-child-membership";
import { getCreditBalances } from "@/lib/classes/credits";
import { hasValidLiabilityWaiver } from "@/lib/consents/liability";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** Families are small in practice (see doc comment above) — this bound
 *  exists to keep the per-child getActiveChildMembership fan-out finite. */
const MAX_CHILDREN = 20;

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  if (!locals.organization) return json({ error: "No organization context" }, 400);

  const organizationId = locals.organization.id;
  const db = getDb();

  // Most-recently-added first, not oldest-first: this endpoint's own doc
  // comment says its main consumer is the POST-CHECKOUT slot picker for a
  // "freshly-subscribed child" (see ChooseSlot's header comment) — for any
  // account past MAX_CHILDREN, an oldest-first cap silently drops exactly
  // that child (the newest row) from the result, breaking the endpoint for
  // its own primary use case. Bug found while adding the choose-slot E2E
  // spec (Task 9) — the shared parent@test.aspiresports.com fixture account
  // has accumulated 400+ family_members rows across the test suite's
  // history, well past the old cap.
  const children = await db
    .select({ id: familyMembers.id, firstName: familyMembers.firstName, lastName: familyMembers.lastName })
    .from(familyMembers)
    .where(eq(familyMembers.parentUserId, locals.user.id))
    .orderBy(desc(familyMembers.createdAt))
    .limit(MAX_CHILDREN);

  if (children.length === 0) {
    return json({ children: [] }, 200);
  }

  const childIds = children.map((c) => c.id);

  // Membership — single-child lookup by design; run all children in
  // parallel rather than sequentially.
  const membershipsByChild = new Map(
    await Promise.all(
      children.map(
        async (c) => [c.id, await getActiveChildMembership(c.id, organizationId)] as const,
      ),
    ),
  );

  // Class-credit balances — single-child lookup by design (see
  // getCreditBalances's doc comment), same "no batch variant, families are
  // small" exception as getActiveChildMembership above. Runs all children
  // in parallel rather than sequentially.
  const creditsByChild = new Map(
    await Promise.all(
      children.map(async (c) => [c.id, await getCreditBalances(c.id, organizationId, db)] as const),
    ),
  );

  // Waiver validity — the canonical ANNUAL predicate (src/lib/consents/
  // liability.ts), the exact same call book-child.ts's booking gate makes,
  // so the dashboard nudge and the engine can never disagree about whether a
  // child is covered. Replaces a local batched "any prior signed booking in
  // this org" query that had no date bound.
  //
  // Per-child, not batched: `hasValidLiabilityWaiver` has no batch variant,
  // and it is three short-circuiting indexed lookups that usually stop at
  // the first. MAX_CHILDREN caps the fan-out at 20, and they run in
  // parallel — the same "families are small, single-child helper is worth
  // more than a bespoke batch query" exception getActiveChildMembership and
  // getCreditBalances already take above. Adding a batch variant would mean
  // a second implementation of the validity rule, which is exactly the
  // divergence this unification exists to remove.
  const waiverOnFileByChild = new Map(
    await Promise.all(
      children.map(
        async (c) =>
          [c.id, await hasValidLiabilityWaiver(c.id, organizationId, db)] as const,
      ),
    ),
  );

  // Standing enrollment — a child could technically hold more than one
  // ACTIVE enrollment (the unique constraint is per-template, not global),
  // so this picks the most recently started one as "the" home slot.
  const enrollmentRows = await db
    .select({
      id: classEnrollments.id,
      familyMemberId: classEnrollments.familyMemberId,
      startedAt: classEnrollments.startedAt,
      templateId: classSlotTemplates.id,
      templateName: classSlotTemplates.name,
      weekday: classSlotTemplates.weekday,
      startTime: classSlotTemplates.startTime,
    })
    .from(classEnrollments)
    .innerJoin(classSlotTemplates, eq(classSlotTemplates.id, classEnrollments.slotTemplateId))
    .where(
      and(
        inArray(classEnrollments.familyMemberId, childIds),
        eq(classEnrollments.status, "active"),
        eq(classSlotTemplates.organizationId, organizationId),
      ),
    )
    .orderBy(desc(classEnrollments.startedAt));
  const enrollmentByChild = new Map<string, (typeof enrollmentRows)[number]>();
  for (const row of enrollmentRows) {
    if (!enrollmentByChild.has(row.familyMemberId)) {
      enrollmentByChild.set(row.familyMemberId, row);
    }
  }

  // Next upcoming CONFIRMED class booking per child.
  const now = new Date();
  const nextSessionRows = await db
    .select({
      familyMemberId: dropInBookings.familyMemberId,
      bookingId: dropInBookings.id,
      sessionId: dropInSessions.id,
      startsAt: dropInSessions.startsAt,
    })
    .from(dropInBookings)
    .innerJoin(dropInSessions, eq(dropInSessions.id, dropInBookings.sessionId))
    .where(
      and(
        inArray(dropInBookings.familyMemberId, childIds),
        eq(dropInBookings.status, "confirmed"),
        eq(dropInSessions.kind, "class"),
        eq(dropInSessions.organizationId, organizationId),
        gt(dropInSessions.startsAt, now),
      ),
    )
    .orderBy(asc(dropInSessions.startsAt));
  const nextSessionByChild = new Map<string, (typeof nextSessionRows)[number]>();
  for (const row of nextSessionRows) {
    if (row.familyMemberId && !nextSessionByChild.has(row.familyMemberId)) {
      nextSessionByChild.set(row.familyMemberId, row);
    }
  }

  // Trial-used: any non-cancelled trial-method booking in this org.
  const trialRows = await db
    .select({ familyMemberId: dropInBookings.familyMemberId })
    .from(dropInBookings)
    .innerJoin(dropInSessions, eq(dropInSessions.id, dropInBookings.sessionId))
    .where(
      and(
        inArray(dropInBookings.familyMemberId, childIds),
        eq(dropInBookings.paymentMethod, "trial"),
        eq(dropInSessions.organizationId, organizationId),
        ne(dropInBookings.status, "cancelled"),
      ),
    );
  const trialUsedSet = new Set(
    trialRows
      .filter((r) => r.familyMemberId !== null)
      .map((r) => r.familyMemberId as string),
  );

  const result = children.map((c) => {
    const membership = membershipsByChild.get(c.id) ?? null;
    const enrollment = enrollmentByChild.get(c.id) ?? null;
    const nextSession = nextSessionByChild.get(c.id) ?? null;
    // Active, spendable balances only — a grant with nothing left or one
    // that's lapsed is history, not something the dashboard should offer to
    // spend. `label` prefers the specific pack/block name; a grant that
    // somehow lost its product/block join (deleted admin-side, restrict FK
    // notwithstanding a pre-FK legacy row) still gets a generic label rather
    // than rendering blank.
    const credits = (creditsByChild.get(c.id) ?? [])
      .filter((g) => g.remaining > 0 && g.expiresAt.getTime() > now.getTime())
      .map((g) => ({
        source: g.source,
        remaining: g.remaining,
        expiresAt: g.expiresAt.toISOString(),
        label: g.packName ?? g.blockName ?? (g.source === "pack" ? "Class pack" : "Block"),
      }));
    return {
      familyMemberId: c.id,
      name: `${c.firstName} ${c.lastName}`,
      membership: membership
        ? {
            tierName: membership.tierName,
            status: membership.status,
            classAllotmentRemaining: membership.classAllotmentRemaining,
          }
        : null,
      enrollment: enrollment
        ? {
            id: enrollment.id,
            templateId: enrollment.templateId,
            templateName: enrollment.templateName,
            weekday: enrollment.weekday,
            startTime: enrollment.startTime,
          }
        : null,
      nextSession: nextSession
        ? {
            sessionId: nextSession.sessionId,
            startsAt: nextSession.startsAt,
            bookingId: nextSession.bookingId,
          }
        : null,
      trialUsed: trialUsedSet.has(c.id),
      credits,
      // Named "on file" for continuity with the client, but the question it
      // now answers is "…and still valid?" — see the helper call above.
      hasWaiverOnFile: waiverOnFileByChild.get(c.id) ?? false,
    };
  });

  return json({ children: result }, 200);
};
