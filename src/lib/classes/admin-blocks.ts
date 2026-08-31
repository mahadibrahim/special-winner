/**
 * Admin class-block support: input validation and the overlap guard the
 * block admin endpoints share.
 *
 * Blocks have NO Stripe objects — unlike packs and templates, a block
 * purchase is priced dynamically at purchase time (see the purchase
 * endpoint from an earlier task), so there is no catalog Product/Price to
 * reconcile here. This file is intentionally thin.
 */
import { and, eq, gte, lte, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { classBlocks } from "@/lib/db/schema/classes";

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Civil date, "YYYY-MM-DD" — matches the `date` column's wire format. */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const blockInputSchema = z
  .object({
    name: z.string().trim().min(1),
    startDate: z.string().regex(DATE_RE, "startDate must be YYYY-MM-DD"),
    endDate: z.string().regex(DATE_RE, "endDate must be YYYY-MM-DD"),
    active: z.boolean().default(true),
  })
  .refine((data) => data.endDate >= data.startDate, {
    message: "endDate must be on or after startDate",
    path: ["endDate"],
  });

export type BlockInput = z.infer<typeof blockInputSchema>;

// ---------------------------------------------------------------------------
// Overlap guard
// ---------------------------------------------------------------------------

/**
 * True when an ACTIVE block in this org already covers any part of
 * [startDate, endDate] (inclusive on both ends — touching windows count as
 * overlapping, unlike the half-open rental-block convention). `excludeId`
 * omits the row being edited so a no-op save of an existing block doesn't
 * trip over itself.
 */
export async function hasOverlappingActiveBlock(
  orgId: string,
  startDate: string,
  endDate: string,
  excludeId?: string,
): Promise<boolean> {
  const db = getDb();
  const conditions = [
    eq(classBlocks.organizationId, orgId),
    eq(classBlocks.active, true),
    lte(classBlocks.startDate, endDate),
    gte(classBlocks.endDate, startDate),
  ];
  if (excludeId) conditions.push(ne(classBlocks.id, excludeId));

  const [row] = await db
    .select({ id: classBlocks.id })
    .from(classBlocks)
    .where(and(...conditions))
    .limit(1);
  return row !== undefined;
}
