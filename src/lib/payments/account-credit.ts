import { getDb } from "@/lib/db";
import {
  accountCredits,
  accountCreditRedemptions,
  type AccountCredit,
} from "@/lib/db/schema";
import { and, asc, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";

/**
 * Account-credit balance is always computed on read from the ledger — never
 * cached — matching the discountCodes/discountUsages pattern:
 *   balance = SUM(unexpired issued) - SUM(redeemed against unexpired)
 *
 * v1 scope: nothing ever sets expiresAt, so the "unexpired" filter is a
 * no-op today but is already correct for when an expiry policy ships.
 */
export async function getAccountCreditBalanceCents(
  userId: string,
  organizationId: string,
): Promise<number> {
  const db = getDb();
  const now = new Date();

  const [issuedRow] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${accountCredits.amountCents}), 0)`,
    })
    .from(accountCredits)
    .where(
      and(
        eq(accountCredits.userId, userId),
        eq(accountCredits.organizationId, organizationId),
        or(isNull(accountCredits.expiresAt), gt(accountCredits.expiresAt, now)),
      ),
    );

  const [redeemedRow] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${accountCreditRedemptions.amountCents}), 0)`,
    })
    .from(accountCreditRedemptions)
    .innerJoin(
      accountCredits,
      eq(accountCreditRedemptions.accountCreditId, accountCredits.id),
    )
    .where(
      and(
        eq(accountCreditRedemptions.userId, userId),
        eq(accountCreditRedemptions.organizationId, organizationId),
        or(isNull(accountCredits.expiresAt), gt(accountCredits.expiresAt, now)),
      ),
    );

  const issued = Number(issuedRow?.total ?? 0);
  const redeemed = Number(redeemedRow?.total ?? 0);

  return Math.max(0, issued - redeemed);
}

export interface IssueAccountCreditInput {
  userId: string;
  organizationId: string;
  amountCents: number;
  reason?: string;
  sourceRegistrationId?: string;
  issuedByUserId?: string;
  expiresAt?: Date;
}

/**
 * Insert a new credit issuance row. Throws on a non-positive amount — an
 * issuance is meaningless (or actively wrong) at zero/negative cents.
 */
export async function issueAccountCredit(
  input: IssueAccountCreditInput,
): Promise<AccountCredit> {
  if (input.amountCents <= 0) {
    throw new Error("issueAccountCredit: amountCents must be positive");
  }

  const db = getDb();
  const [row] = await db
    .insert(accountCredits)
    .values({
      userId: input.userId,
      organizationId: input.organizationId,
      amountCents: input.amountCents,
      reason: input.reason,
      sourceRegistrationId: input.sourceRegistrationId,
      issuedByUserId: input.issuedByUserId,
      expiresAt: input.expiresAt,
    })
    .returning();

  return row;
}

export interface RedeemAccountCreditInput {
  userId: string;
  organizationId: string;
  registrationId: string;
  amountCentsRequested: number;
}

export interface RedeemAccountCreditResult {
  redeemedCents: number;
}

/**
 * FIFO-allocate a redemption across a user's available (unexpired,
 * not-fully-spent) credit issuance rows, oldest-expiring first then
 * oldest-issued first. Locks the candidate issuance rows FOR UPDATE inside a
 * transaction so two concurrent checkouts can't both read the same
 * available balance and both redeem against it.
 *
 * The request amount is clamped to the actual available balance — this IS
 * the over-apply guard (mirrors the client-never-supplies-an-amount design:
 * even if a caller passes a too-large amountCentsRequested, the ledger can't
 * go negative).
 */
export async function redeemAccountCredit(
  input: RedeemAccountCreditInput,
): Promise<RedeemAccountCreditResult> {
  const { userId, organizationId, registrationId, amountCentsRequested } = input;

  if (amountCentsRequested <= 0) {
    return { redeemedCents: 0 };
  }

  const db = getDb();
  const now = new Date();

  return db.transaction(async (tx) => {
    // Lock every unexpired issuance row for this user+org, oldest-expiring
    // (NULLs — i.e. never-expiring — last) then oldest-issued first.
    const issuances = await tx
      .select()
      .from(accountCredits)
      .where(
        and(
          eq(accountCredits.userId, userId),
          eq(accountCredits.organizationId, organizationId),
          or(isNull(accountCredits.expiresAt), gt(accountCredits.expiresAt, now)),
        ),
      )
      .orderBy(
        sql`${accountCredits.expiresAt} IS NULL, ${accountCredits.expiresAt} ASC`,
        asc(accountCredits.createdAt),
      )
      .for("update");

    if (issuances.length === 0) {
      return { redeemedCents: 0 };
    }

    const issuanceIds = issuances.map((i) => i.id);

    // Already-redeemed totals per issuance, computed under the same lock.
    const redeemedRows = await tx
      .select({
        accountCreditId: accountCreditRedemptions.accountCreditId,
        total: sql<string>`COALESCE(SUM(${accountCreditRedemptions.amountCents}), 0)`,
      })
      .from(accountCreditRedemptions)
      .where(inArray(accountCreditRedemptions.accountCreditId, issuanceIds))
      .groupBy(accountCreditRedemptions.accountCreditId);

    const redeemedByIssuance = new Map<string, number>();
    for (const r of redeemedRows) {
      redeemedByIssuance.set(r.accountCreditId, Number(r.total));
    }

    let remaining = amountCentsRequested;
    let redeemedCents = 0;

    for (const issuance of issuances) {
      if (remaining <= 0) break;

      const alreadyRedeemed = redeemedByIssuance.get(issuance.id) ?? 0;
      const available = issuance.amountCents - alreadyRedeemed;
      if (available <= 0) continue;

      const take = Math.min(available, remaining);
      if (take <= 0) continue;

      await tx.insert(accountCreditRedemptions).values({
        accountCreditId: issuance.id,
        userId,
        organizationId,
        registrationId,
        amountCents: take,
      });

      remaining -= take;
      redeemedCents += take;
    }

    return { redeemedCents };
  });
}
