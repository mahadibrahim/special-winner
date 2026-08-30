/**
 * Class-credit ledger reads: per-child grant balances, and the pure policy
 * that picks WHICH grant a given class session should spend.
 *
 * Balances are COUNT-DERIVED, never stored — `remaining` is
 * `sessionsGranted − (bookings referencing the grant in a seat-holding
 * status)`. Cancelling a booking therefore returns the credit with no
 * compensating write, exactly like the monthly membership allotment in
 * src/lib/memberships/allotment.ts (and with the same accepted TOCTOU
 * tolerance: the booking transaction is the real gate).
 */
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classBlocks, classCreditGrants, classPackProducts } from "@/lib/db/schema/classes";
import { dropInBookings } from "@/lib/db/schema/drop-in";

type DbClient =
  | ReturnType<typeof getDb>
  | Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

/**
 * Booking statuses that HOLD a seat and therefore consume a credit.
 * `cancelled` is excluded — the credit returns on cancel. `no_show` still
 * consumes: the seat was held and the class ran.
 */
const CONSUMING_BOOKING_STATUSES = [
  "confirmed",
  "waitlisted",
  "pending_claim",
  "pending_payment",
  "no_show",
] as const;

export interface CreditGrantBalance {
  grantId: string;
  source: "pack" | "block";
  slotTemplateId: string | null; // set → pinned to that weekly slot
  sessionsGranted: number;
  used: number;
  remaining: number; // max(0, granted - used)
  expiresAt: Date;
  packName: string | null; // joined pack product name (display)
  blockName: string | null; // joined block name (display)
}

/** All of a child's grants in this org (including exhausted/expired — the
 *  caller filters; the dashboard shows history). Ordered expiresAt ASC. */
export async function getCreditBalances(
  familyMemberId: string,
  organizationId: string,
  dbOrTx?: DbClient,
): Promise<CreditGrantBalance[]> {
  const db = dbOrTx ?? getDb();

  const grants = await db
    .select({
      id: classCreditGrants.id,
      source: classCreditGrants.source,
      slotTemplateId: classCreditGrants.slotTemplateId,
      sessionsGranted: classCreditGrants.sessionsGranted,
      expiresAt: classCreditGrants.expiresAt,
      packName: classPackProducts.name,
      blockName: classBlocks.name,
    })
    .from(classCreditGrants)
    .leftJoin(classPackProducts, eq(classPackProducts.id, classCreditGrants.packProductId))
    .leftJoin(classBlocks, eq(classBlocks.id, classCreditGrants.blockId))
    .where(
      and(
        eq(classCreditGrants.familyMemberId, familyMemberId),
        eq(classCreditGrants.organizationId, organizationId),
      ),
    )
    .orderBy(asc(classCreditGrants.expiresAt));

  if (grants.length === 0) return [];

  const usageRows = await db
    .select({ creditGrantId: dropInBookings.creditGrantId, used: count() })
    .from(dropInBookings)
    .where(
      and(
        inArray(
          dropInBookings.creditGrantId,
          grants.map((g) => g.id),
        ),
        inArray(dropInBookings.status, [...CONSUMING_BOOKING_STATUSES]),
      ),
    )
    .groupBy(dropInBookings.creditGrantId);

  const usedByGrant = new Map<string, number>();
  for (const row of usageRows) {
    if (row.creditGrantId) usedByGrant.set(row.creditGrantId, Number(row.used));
  }

  return grants.map((g) => {
    const used = usedByGrant.get(g.id) ?? 0;
    return {
      grantId: g.id,
      source: g.source,
      slotTemplateId: g.slotTemplateId,
      sessionsGranted: g.sessionsGranted,
      used,
      remaining: Math.max(0, g.sessionsGranted - used),
      expiresAt: g.expiresAt,
      packName: g.packName,
      blockName: g.blockName,
    };
  });
}

/** Pure. Picks the grant to redeem for a session of `slotTemplateId`
 *  (null for one-off class sessions): pinned grants matching the template
 *  first, then floating pack grants; earliest expiry wins within each
 *  class; unexpired (expiresAt > now) and remaining > 0 only. Returns
 *  null when nothing is redeemable. */
export function selectRedeemableGrant(
  balances: CreditGrantBalance[],
  opts: { slotTemplateId: string | null; now: Date },
): CreditGrantBalance | null {
  const nowMs = opts.now.getTime();

  const candidates = balances.filter((b) => {
    if (b.remaining <= 0) return false;
    if (b.expiresAt.getTime() <= nowMs) return false;
    // A pinned grant only ever spends on its own template's sessions.
    if (b.slotTemplateId !== null && b.slotTemplateId !== opts.slotTemplateId) return false;
    return true;
  });

  // Spend the narrower credit first: a pinned grant is useless anywhere
  // else, a floating pack keeps its optionality.
  const rank = (b: CreditGrantBalance) => (b.slotTemplateId !== null ? 0 : 1);

  return (
    [...candidates].sort(
      (a, b) => rank(a) - rank(b) || a.expiresAt.getTime() - b.expiresAt.getTime(),
    )[0] ?? null
  );
}
