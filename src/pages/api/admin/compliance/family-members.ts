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
import { and, eq, desc, sql } from "drizzle-orm";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";

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
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const db = getDb();
    const url = new URL(context.request.url);
    const search = url.searchParams.get("search")?.trim() ?? "";

    const conditions = [
      eq(locations.organizationId, orgContext.organizationId),
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
    const allConsents = await db
      .select()
      .from(consents)
      .where(sql`${consents.familyMemberId} = ANY (${memberIds})`)
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
