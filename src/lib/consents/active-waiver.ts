/**
 * Resolve the org's current liability waiver for content-hashed audit
 * capture at signing time. Prefers an org-specific waiver row over the
 * global default (organizationId NULL).
 */
import { createHash } from "node:crypto";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { waivers } from "@/lib/db/schema/consents";

/**
 * The org's current liability waiver (org-specific preferred, else the global
 * default), with a sha256 of its content for tamper-proof audit. Null if none
 * is configured — callers then store a null waiverId and a version string.
 */
export async function resolveActiveLiabilityWaiver(
  db: Database,
  orgId: string | null,
): Promise<{ id: string; contentHash: string } | null> {
  const rows = await db
    .select({ id: waivers.id, content: waivers.content, orgId: waivers.organizationId })
    .from(waivers)
    .where(
      and(
        eq(waivers.type, "liability"),
        isNull(waivers.supersededAt),
        or(eq(waivers.organizationId, orgId ?? ""), isNull(waivers.organizationId)),
      ),
    )
    // Prefer the org-specific row over the global default; break any tie
    // (e.g. a hypothetical two-active-waiver case) deterministically by
    // most-recently-effective.
    .orderBy(sql`${waivers.organizationId} nulls last`, desc(waivers.effectiveAt))
    .limit(1);
  const w = rows[0];
  if (!w) return null;
  return { id: w.id, contentHash: createHash("sha256").update(w.content).digest("hex") };
}
