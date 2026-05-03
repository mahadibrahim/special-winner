import { eq, isNotNull, and, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  consents,
  familyMembers,
  mediaAssets,
  mediaTags,
} from "@/lib/db/schema";
import type { MediaAuthScope } from "@/lib/consents/record";

export interface MissingConsent {
  familyMemberId: string;
  firstName: string;
  lastName: string;
}

export interface PublishConsentCheck {
  canPublish: boolean;
  intendedScope: MediaAuthScope;
  totalTagged: number;
  missing: MissingConsent[];
}

/**
 * Returns the list of tagged participants in a shoot session who do NOT have
 * an active media_authorization consent for the session's intendedScope.
 *
 * If `missing` is empty, the session can be published cleanly. Otherwise the
 * caller decides whether to soft-warn (log + allow) or hard-block (refuse)
 * based on rollout phase — see `MEDIA_AUTH_HARD_BLOCK` env var in callers.
 */
export async function checkSessionPublishConsent(
  db: Database,
  sessionId: string,
  intendedScope: MediaAuthScope,
): Promise<PublishConsentCheck> {
  // Distinct family_members tagged across any asset in the session. Tags
  // without a familyMemberId (team tags) don't gate publish, so filter them
  // out at the SQL layer.
  const tagged = await db
    .selectDistinct({
      familyMemberId: familyMembers.id,
      firstName: familyMembers.firstName,
      lastName: familyMembers.lastName,
    })
    .from(mediaTags)
    .innerJoin(mediaAssets, eq(mediaTags.mediaAssetId, mediaAssets.id))
    .innerJoin(familyMembers, eq(mediaTags.familyMemberId, familyMembers.id))
    .where(
      and(
        eq(mediaAssets.shootSessionId, sessionId),
        isNotNull(mediaTags.familyMemberId),
      ),
    );

  if (tagged.length === 0) {
    return { canPublish: true, intendedScope, totalTagged: 0, missing: [] };
  }

  const taggedIds = tagged.map((t) => t.familyMemberId);

  // For each tagged family_member, fetch the most-recent media_authorization
  // consent for the intended scope. Active = status='granted' AND not expired.
  // Drizzle: we use a window-function lateral via DISTINCT ON for efficiency.
  const latestRows = await db.execute<{
    family_member_id: string;
    status: "granted" | "revoked";
    expires_at: Date | null;
  }>(sql`
    SELECT DISTINCT ON (${consents.familyMemberId})
      ${consents.familyMemberId} AS family_member_id,
      ${consents.status} AS status,
      ${consents.expiresAt} AS expires_at
    FROM ${consents}
    WHERE ${consents.familyMemberId} = ANY (${taggedIds})
      AND ${consents.type} = 'media_authorization'
      AND ${consents.scope} = ${intendedScope}
    ORDER BY ${consents.familyMemberId}, ${consents.signedAt} DESC
  `);

  const now = Date.now();
  const grantedSet = new Set<string>();
  // drizzle's execute returns { rows: [...] } in node-postgres; handle both
  // shapes for portability across the codebase.
  const rows: Array<{
    family_member_id: string;
    status: "granted" | "revoked";
    expires_at: Date | null;
  }> = Array.isArray(latestRows)
    ? (latestRows as never)
    : ((latestRows as { rows?: typeof rows }).rows ?? []);
  for (const r of rows) {
    if (r.status !== "granted") continue;
    if (r.expires_at && new Date(r.expires_at).getTime() <= now) continue;
    grantedSet.add(r.family_member_id);
  }

  const missing: MissingConsent[] = tagged
    .filter((t) => !grantedSet.has(t.familyMemberId))
    .map((t) => ({
      familyMemberId: t.familyMemberId,
      firstName: t.firstName,
      lastName: t.lastName,
    }));

  return {
    canPublish: missing.length === 0,
    intendedScope,
    totalTagged: tagged.length,
    missing,
  };
}

/**
 * True when the operator has enabled hard-blocking. During the soft-warn
 * rollout window (the first ~2 weeks of launch), this stays false — the
 * publish endpoint logs the missing list but allows the publish.
 */
export function isMediaAuthHardBlockEnabled(): boolean {
  return import.meta.env.MEDIA_AUTH_HARD_BLOCK === "true";
}
