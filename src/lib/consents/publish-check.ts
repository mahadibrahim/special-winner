import { eq, isNotNull, and, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import {
  consents,
  familyMembers,
  mediaAssets,
  mediaTags,
} from "@/lib/db/schema";
import type { MediaAuthScope } from "@/lib/consents/record";
import {
  getFaceTaggedDoNotPublishForSession,
  type DoNotPublishMatch,
} from "@/lib/consents/do-not-publish";

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
  /**
   * Face-tagged individuals in the session who are on the org's active
   * media do-not-publish list (product-backlog build #3 — an individual
   * opt-out, never a team/roster gate). Opt-out wins even if the same
   * individual also has a granted `missing`-clearing consent row for this
   * scope — a takedown/opt-out intent beats a stale "yes". `canPublish` is
   * false whenever this array is non-empty, independent of `missing`.
   *
   * This is populated purely from face tags (`mediaTags.familyMemberId`).
   * Team tags (`mediaTags.teamId`) never feed this list — a team/wide
   * session with no face tags always gets `doNotPublish: []` here,
   * regardless of any roster member's opt-out status. See
   * `src/lib/consents/do-not-publish.ts` for the individual-only framing.
   */
  doNotPublish: DoNotPublishMatch[];
}

/**
 * Returns the list of tagged participants in a shoot session who do NOT have
 * an active media_authorization consent for the session's intendedScope,
 * plus any face-tagged individual who is on the org's active do-not-publish
 * list (opt-out wins over a stale consent — see `doNotPublish` above).
 *
 * If both `missing` and `doNotPublish` are empty, the session can be
 * published cleanly. Otherwise the caller decides whether to soft-warn
 * (log + allow) or hard-block (refuse) based on rollout phase — see
 * `MEDIA_AUTH_HARD_BLOCK` env var in callers.
 *
 * Team-tag media is NEVER gated here — only individually face-tagged media
 * is checked, for both the missing-consent path (pre-existing behavior) and
 * the do-not-publish path (new in build #3). A team/wide session's tags
 * carry no `familyMemberId`, so they're filtered out at the SQL layer for
 * `missing`, and `getFaceTaggedDoNotPublishForSession` only ever looks at
 * face tags — there is no roster-level blocking anywhere in this function.
 */
export async function checkSessionPublishConsent(
  db: Database,
  sessionId: string,
  intendedScope: MediaAuthScope,
  organizationId: string,
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
    // No face tags at all in this session — including a pure team/wide
    // session, which by definition has zero familyMemberId tags. There is
    // nothing for the do-not-publish check to match either (it's scoped to
    // face tags), so this is the "team-tag path publishes by default, no
    // roster blocking" case in one early return.
    return {
      canPublish: true,
      intendedScope,
      totalTagged: 0,
      missing: [],
      doNotPublish: [],
    };
  }

  const taggedIds = tagged.map((t) => t.familyMemberId);

  // For each tagged family_member, fetch the most-recent media_authorization
  // consent for the intended scope. Active = status='granted' AND not expired.
  // Drizzle: we use a window-function lateral via DISTINCT ON for efficiency.
  //
  // NOTE (pre-existing bug, fixed here): this used to interpolate the array
  // directly as `= ANY (${taggedIds})`. Drizzle's sql-template does not bind
  // a JS array as a single Postgres array parameter — for a single-tagged-
  // participant session in particular it produced `= ANY (($1))` with $1
  // bound as a bare scalar, and Postgres rejected it with "malformed array
  // literal" trying to cast it to an array type (same bug found and fixed
  // in src/pages/api/admin/compliance/family-members.ts while wiring
  // Task 3). `sql.join(...)` renders a proper `IN (...)` list instead —
  // the same pattern already used in src/pages/api/public/seasons.ts.
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
    WHERE ${consents.familyMemberId} IN (${sql.join(taggedIds.map((id) => sql`${id}`), sql`, `)})
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

  // Individual opt-out check (build #3) — face-tagged individuals only,
  // scoped to this org. Opt-out wins even for an individual who IS in
  // `grantedSet` above (a stale "yes" doesn't override a takedown/opt-out).
  const doNotPublish = await getFaceTaggedDoNotPublishForSession(
    db,
    sessionId,
    organizationId,
  );

  return {
    canPublish: missing.length === 0 && doNotPublish.length === 0,
    intendedScope,
    totalTagged: tagged.length,
    missing,
    doNotPublish,
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
