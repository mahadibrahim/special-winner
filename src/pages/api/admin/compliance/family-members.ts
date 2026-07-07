import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  familyMembers,
  registrations,
  seasons,
  programs,
  consents,
} from "@/lib/db/schema";
import { locations } from "@/lib/db/schema/organizations";
import { and, eq, desc, sql, inArray } from "drizzle-orm";
import { requireOrgAdminAccess } from "@/lib/auth";
import { mediaDoNotPublish } from "@/lib/db/schema/media-do-not-publish";

/**
 * GET /api/admin/compliance/family-members
 *
 * Returns the org's family_members along with their current consent status:
 *   - parental: granted? (date, signer)
 *   - liability: granted? not expired? (date, expiresAt, signer)
 *   - media_auth.{internal,promotional,public}: granted? (date)
 *
 * "Org's family_members" = anyone with at least one registration whose season
 * belongs to the caller's organization.
 *
 * Optional query params:
 *   - search: substring match on first/last name
 *   - missing: comma-separated list of statuses to filter by — values:
 *       "parental", "liability_current", "media_internal",
 *       "media_promotional", "media_public"
 */
export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const db = getDb();
    const url = new URL(context.request.url);
    const search = url.searchParams.get("search")?.trim() ?? "";

    const conditions = [
      eq(locations.organizationId, auth.organizationId),
    ];
    if (search) {
      conditions.push(
        sql`(lower(${familyMembers.firstName}) like ${"%" + search.toLowerCase() + "%"} OR lower(${familyMembers.lastName}) like ${"%" + search.toLowerCase() + "%"})`,
      );
    }

    const memberRows = await db
      .selectDistinct({
        id: familyMembers.id,
        firstName: familyMembers.firstName,
        lastName: familyMembers.lastName,
        birthDate: familyMembers.birthDate,
        kind: sql<"self" | "dependent">`CASE WHEN ${familyMembers.selfUserId} IS NOT NULL THEN 'self' ELSE 'dependent' END`,
      })
      .from(familyMembers)
      .innerJoin(registrations, eq(registrations.familyMemberId, familyMembers.id))
      .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .where(and(...conditions))
      .orderBy(familyMembers.lastName, familyMembers.firstName);

    if (memberRows.length === 0) {
      return json({ familyMembers: [] });
    }

    const memberIds = memberRows.map((m) => m.id);

    // Pull all consents for those family_members in one query and reduce to
    // the most-recent per (familyMemberId, type, scope) tuple in JS.
    //
    // NOTE (pre-existing bug, fixed here): this used to be a raw
    // `sql\`${consents.familyMemberId} = ANY (${memberIds})\`` predicate.
    // Drizzle's sql-template interpolation does not bind a JS array as a
    // single Postgres array parameter — for a single-element memberIds
    // array in particular it produced `= ANY (($1))` with $1 bound as a
    // bare scalar, which Postgres then rejected with "malformed array
    // literal" trying to cast it to an array type. `inArray()` compiles to
    // a plain `IN (...)` list and has no such edge case (see the same
    // pattern already used throughout require-resource-ownership.ts).
    const allConsents = await db
      .select()
      .from(consents)
      .where(inArray(consents.familyMemberId, memberIds))
      .orderBy(desc(consents.signedAt));

    type LatestKey = string;
    function key(fmId: string, type: string, scope: string | null): LatestKey {
      return `${fmId}|${type}|${scope ?? ""}`;
    }
    const latest = new Map<LatestKey, (typeof consents.$inferSelect)>();
    for (const c of allConsents) {
      const k = key(c.familyMemberId, c.type, c.scope);
      if (!latest.has(k)) latest.set(k, c);
    }

    const now = Date.now();
    function statusFor(fmId: string, type: string, scope: string | null) {
      const c = latest.get(key(fmId, type, scope));
      if (!c) return { status: "missing" as const };
      if (c.status === "revoked") {
        return {
          status: "revoked" as const,
          signedAt: c.signedAt,
          revokedAt: c.signedAt,
        };
      }
      if (c.expiresAt && c.expiresAt.getTime() <= now) {
        return {
          status: "expired" as const,
          signedAt: c.signedAt,
          expiresAt: c.expiresAt,
        };
      }
      return {
        status: "active" as const,
        signedAt: c.signedAt,
        expiresAt: c.expiresAt,
        signedByName: c.signedByName,
      };
    }

    // Individual media opt-out / do-not-publish flags (product-backlog
    // build #3) — bulk-fetched alongside consents, same pattern. Only the
    // active row (if any) per family_member matters here.
    const doNotPublishRows = await db
      .select({
        familyMemberId: mediaDoNotPublish.familyMemberId,
        reason: mediaDoNotPublish.reason,
      })
      .from(mediaDoNotPublish)
      .where(
        and(
          inArray(mediaDoNotPublish.familyMemberId, memberIds),
          eq(mediaDoNotPublish.organizationId, auth.organizationId),
          eq(mediaDoNotPublish.active, true),
        ),
      );
    const doNotPublishByFm = new Map(
      doNotPublishRows.map((r) => [r.familyMemberId, r.reason]),
    );

    const result = memberRows.map((m) => ({
      id: m.id,
      firstName: m.firstName,
      lastName: m.lastName,
      birthDate: m.birthDate,
      kind: m.kind,
      consents: {
        parental:
          m.kind === "self"
            ? null // self-registrants don't need parental consent
            : statusFor(m.id, "parental", null),
        ageConfirmation:
          m.kind === "self" ? statusFor(m.id, "age_confirmation", null) : null,
        liability: statusFor(m.id, "liability", null),
        mediaInternal: statusFor(m.id, "media_authorization", "internal"),
        mediaPromotional: statusFor(m.id, "media_authorization", "promotional"),
        mediaPublic: statusFor(m.id, "media_authorization", "public"),
      },
      doNotPublish: doNotPublishByFm.has(m.id)
        ? { active: true as const, reason: doNotPublishByFm.get(m.id) ?? null }
        : { active: false as const },
    }));

    return json({ familyMembers: result });
  } catch (err) {
    console.error("[admin/compliance] error:", err);
    return json({ error: "Internal server error" }, 500);
  }
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
