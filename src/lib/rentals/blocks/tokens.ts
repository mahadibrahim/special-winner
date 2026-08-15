/**
 * Tokenized public access to a rental block.
 *
 * Block renters arrive from a text message, not a signup: the whole renter
 * side (quote, deposit, balance, receipt) lives on one page addressed by a
 * token, with no account required. Same `mintToken` mechanism as the rental
 * claim links, but a much longer TTL - the link has to outlive the 72h deposit
 * hold AND the balance reminder schedule (T-14 through T+1), so a renter who
 * paid a deposit in November can still open the same link in February to pay
 * the balance. Mirrors the CLAIM_TTL_HOURS reasoning in `@/lib/rentals/claim`.
 *
 * These tokens are deliberately never consumed: the page is the receipt too,
 * so it has to keep working after both payments land.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  fieldRentalBlocks,
  type FieldRentalBlock,
} from "@/lib/db/schema/field-rental-blocks";
import { mintToken, verifyToken } from "@/lib/check-in/tokens-db";

/** 45 days: outlives the deposit hold (72h) and the balance reminder run. */
export const BLOCK_TOKEN_TTL_HOURS = 24 * 45;

/**
 * Mint (or reuse) the public link token for a block. `mintToken` returns a
 * live unconsumed token when one already exists for the same (kind, targetId),
 * so resending a deposit or balance link is idempotent and every email the
 * renter has ever received keeps pointing at the same page.
 */
export async function mintBlockToken(block: FieldRentalBlock): Promise<string> {
  const t = await mintToken({
    kind: "rental_block",
    targetId: block.id,
    organizationId: block.organizationId,
    // A block spans a location, not a venue - each session carries its own.
    venueId: null,
    sentVia: "email",
    recipientUserId: block.renterUserId,
    recipientEmail: block.renterEmail,
    recipientPhone: block.renterPhone,
    createdByUserId: null,
    ttlHours: BLOCK_TOKEN_TTL_HOURS,
  });
  return t.token;
}

export type ResolveBlockTokenResult =
  | { ok: true; block: FieldRentalBlock }
  | { ok: false; reason: "not_found" | "expired" };

/**
 * Resolve a public block token, distinguishing "no such link" (404) from
 * "this link has lapsed" (410) so the endpoint and the page can say which.
 */
export async function resolveBlockTokenResult(
  token: string,
): Promise<ResolveBlockTokenResult> {
  const v = await verifyToken(token);
  if (!v.ok) {
    // `consumed` is unreachable for this kind (we never consume block tokens)
    // but is a lapse rather than a typo, so it groups with `expired`.
    const lapsed = v.reason === "expired" || v.reason === "consumed";
    return { ok: false, reason: lapsed ? "expired" : "not_found" };
  }
  if (v.token.kind !== "rental_block") return { ok: false, reason: "not_found" };

  const [block] = await getDb()
    .select()
    .from(fieldRentalBlocks)
    .where(eq(fieldRentalBlocks.id, v.token.targetId))
    .limit(1);
  if (!block) return { ok: false, reason: "not_found" };
  return { ok: true, block };
}

/** Convenience wrapper for callers that don't need to tell 404 from 410. */
export async function resolveBlockToken(
  token: string,
): Promise<{ block: FieldRentalBlock } | null> {
  const r = await resolveBlockTokenResult(token);
  return r.ok ? { block: r.block } : null;
}

export interface BlockOwed {
  kind: "deposit" | "balance" | "none";
  cents: number;
  /** When the amount is due (deposit: hold expiry; balance: balanceDueAt). */
  dueAt: Date | null;
}

/**
 * What the renter owes right now. The block row is the payment source of
 * truth - sessions stay unpaid until the block is settled - so this reads the
 * block and nothing else.
 */
export function computeBlockOwed(block: FieldRentalBlock): BlockOwed {
  if (block.status === "awaiting_deposit" && block.depositDueCents > 0) {
    return {
      kind: "deposit",
      cents: block.depositDueCents,
      dueAt: block.depositExpiresAt,
    };
  }
  if (
    block.status === "active" &&
    block.balancePaidAt === null &&
    block.balanceDueCents > 0
  ) {
    return {
      kind: "balance",
      cents: block.balanceDueCents,
      dueAt: block.balanceDueAt,
    };
  }
  return { kind: "none", cents: 0, dueAt: null };
}
