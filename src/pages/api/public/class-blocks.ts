/**
 * GET /api/public/class-blocks
 *
 * The ONE block a family can buy into right now: the current-or-next active
 * `class_blocks` window (earliest `startDate` among active blocks that have
 * not ended in the org's timezone), with a per-slot quote for every sellable
 * class template.
 *
 * Deliberately singular. A block is an org-wide term ("Fall Block, Sep 15 –
 * Nov 7"); the purchase decision is "which SLOT do I want", not "which term" —
 * so the catalog resolves the term server-side and the UI only ever renders
 * slots. `{ block: null }` (200) is the normal state between terms.
 *
 * Per template the response carries BOTH prices:
 *  - `totalSessions` / `fullPriceCents` — the whole window, so the card can
 *    show what the block is worth ("12 sessions, $360").
 *  - `remainingSessions` / `proratedPriceCents` — what a family joining NOW
 *    actually gets and pays. Mid-block these differ; before the block starts
 *    they are equal. Both come from `blockOccurrenceInstants`, which walks
 *    civil days through `Intl` in the org zone, so a window straddling a DST
 *    transition counts correctly (see src/lib/classes/block-occurrences.ts).
 *
 * Templates whose `blockRateCents` AND `sessionRateCents` are both null are
 * OMITTED, not priced at zero: with no class rate configured the only fallback
 * is the ADULT pickup rate card, and quoting that for a kids' block is exactly
 * the failure Task 5 turned into `class_rate_not_configured`. Same for a
 * template whose weekday never lands inside the window (`totalSessions === 0`)
 * — a "0 sessions for $0" card is not a purchasable thing.
 *
 * `remainingSessions` CAN legitimately be 0 while the block is still running
 * (its last occurrence of that weekday has passed but `endDate` has not), and
 * such a slot is still listed so the UI can say "no sessions left this term"
 * instead of silently dropping a class families know exists. Consumers must
 * NOT offer a purchase in that state — `proratedPriceCents` is 0 there, and
 * the purchase endpoint refuses it rather than trusting the client.
 */
import type { APIRoute } from "astro";
import { and, asc, count, eq, gte, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classBlocks, classEnrollments, classSlotTemplates } from "@/lib/db/schema/classes";
import { venues } from "@/lib/db/schema/teams";
import { blockOccurrenceInstants } from "@/lib/classes/block-occurrences";
import { civilPartsInTz } from "@/lib/classes/materialize";
import { ORG_DEFAULT_TIMEZONE } from "@/lib/time/zoned-day";

export const prerender = false;

const DAY_MS = 86_400_000;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      // Short cache only: `proratedPriceCents` is a function of `now`, so a
      // long-lived CDN copy would quote a stale (too-high) price after a
      // session passes. 60s matches /api/public/class-schedule.
      "Cache-Control": "public, max-age=60",
    },
  });

/** "YYYY-MM-DD" for today as observed in `timeZone`. */
function civilTodayInTz(timeZone: string): string {
  const { y, m, day } = civilPartsInTz(new Date(), timeZone);
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * An instant guaranteed to fall before the block window's first local
 * occurrence — 24h before UTC midnight of `startDate`. `blockOccurrenceInstants`
 * clamps its lower bound forward to the window's own start, so any earlier
 * instant yields the full window; going a whole day back keeps it earlier than
 * local midnight of `startDate` in every real-world zone (max offset ±14h).
 */
function eveOfBlock(startDate: string): Date {
  const [y, m, d] = startDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d) - DAY_MS);
}

export const GET: APIRoute = async ({ locals }) => {
  const organization = locals.organization;
  if (!organization) return json({ block: null }, 200);

  const db = getDb();

  // `locals.organization` is the full `organizations` row (see env.d.ts), so
  // the zone is already in hand — no second round trip. Nullable column, same
  // repo-wide fallback the materialize cron uses.
  const timeZone = organization.timezone ?? ORG_DEFAULT_TIMEZONE;
  const today = civilTodayInTz(timeZone);

  // Current-or-next: still running (endDate is today or later) or starting
  // later, earliest first. Ended blocks fall out on the `endDate` predicate.
  const [block] = await db
    .select({
      id: classBlocks.id,
      name: classBlocks.name,
      startDate: classBlocks.startDate,
      endDate: classBlocks.endDate,
    })
    .from(classBlocks)
    .where(
      and(
        eq(classBlocks.organizationId, organization.id),
        eq(classBlocks.active, true),
        gte(classBlocks.endDate, today),
      ),
    )
    .orderBy(asc(classBlocks.startDate))
    .limit(1);

  if (!block) return json({ block: null }, 200);

  const templateRows = await db
    .select({
      id: classSlotTemplates.id,
      name: classSlotTemplates.name,
      weekday: classSlotTemplates.weekday,
      startTime: classSlotTemplates.startTime,
      capacity: classSlotTemplates.capacity,
      sessionRateCents: classSlotTemplates.sessionRateCents,
      blockRateCents: classSlotTemplates.blockRateCents,
      venueName: venues.name,
    })
    .from(classSlotTemplates)
    .innerJoin(venues, eq(venues.id, classSlotTemplates.venueId))
    .where(
      and(
        eq(classSlotTemplates.organizationId, organization.id),
        eq(classSlotTemplates.active, true),
      ),
    )
    .orderBy(asc(classSlotTemplates.weekday), asc(classSlotTemplates.startTime));

  // Seat count = ACTIVE enrollments per template — the same number
  // /api/public/class-schedule reports as `enrolledCount`, and the same one
  // `enrollChild` checks capacity against. One grouped query, never N+1.
  const templateIds = templateRows.map((t) => t.id);
  const enrolledRows = templateIds.length
    ? await db
        .select({ slotTemplateId: classEnrollments.slotTemplateId, n: count() })
        .from(classEnrollments)
        .where(
          and(
            inArray(classEnrollments.slotTemplateId, templateIds),
            eq(classEnrollments.status, "active"),
          ),
        )
        .groupBy(classEnrollments.slotTemplateId)
    : [];
  const enrolledByTemplate = new Map(enrolledRows.map((r) => [r.slotTemplateId, r.n]));

  const now = new Date();
  const windowEve = eveOfBlock(block.startDate);

  const templates = templateRows.flatMap((t) => {
    const rateCents = t.blockRateCents ?? t.sessionRateCents;
    if (rateCents === null) return []; // unsellable — no class rate configured

    const occurrenceOpts = {
      weekday: t.weekday,
      startTime: t.startTime,
      timeZone,
      startDate: block.startDate,
      endDate: block.endDate,
    };
    const totalSessions = blockOccurrenceInstants({ ...occurrenceOpts, after: windowEve }).length;
    if (totalSessions === 0) return []; // weekday never lands in this window

    const remainingSessions = blockOccurrenceInstants({ ...occurrenceOpts, after: now }).length;
    const enrolled = enrolledByTemplate.get(t.id) ?? 0;

    return [
      {
        slotTemplateId: t.id,
        name: t.name,
        weekday: t.weekday,
        startTime: t.startTime,
        venueName: t.venueName,
        spotsLeft: Math.max(t.capacity - enrolled, 0),
        totalSessions,
        remainingSessions,
        fullPriceCents: totalSessions * rateCents,
        proratedPriceCents: remainingSessions * rateCents,
      },
    ];
  });

  return json(
    {
      block: {
        id: block.id,
        name: block.name,
        startDate: block.startDate,
        endDate: block.endDate,
        upcoming: block.startDate > today, // both are "YYYY-MM-DD" — lexical order is chronological
        templates,
      },
    },
    200,
  );
};
