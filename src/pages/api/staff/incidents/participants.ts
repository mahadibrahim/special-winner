/**
 * GET /api/staff/incidents/participants?q=<query>
 *
 * Name search over the caller's org's registered participants, for the
 * incident-report form's "who is this about" picker. Only family_members
 * with an existing registration in this org are visible (matches
 * requireSameOrgFamilyMember's join chain) — this is a lookup over
 * existing registrants, never a create/resolvePerson() path.
 *
 * <2-char query -> empty results (avoids a full-table ilike scan on every
 * keystroke). Capped at 10, de-duped (a family_member can have multiple
 * registrations across seasons/programs).
 */
import type { APIRoute } from "astro";
import { and, eq, ilike, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { familyMembers, registrations } from "@/lib/db/schema/registrations";
import { seasons, programs } from "@/lib/db/schema/programs";
import { locations } from "@/lib/db/schema/organizations";
import { requireStaffAccess } from "@/lib/auth";

export const prerender = false;

const MAX_RESULTS = 10;
// Overfetch before de-duping in JS (a family_member with several
// registrations would otherwise cost it multiple slots in a DB-level LIMIT).
const FETCH_LIMIT = 50;

export const GET: APIRoute = async (context) => {
  const auth = await requireStaffAccess(context);
  if (!auth.authorized) return auth.response;

  const url = new URL(context.request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return new Response(JSON.stringify({ participants: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const term = `%${q}%`;
  const rows = await getDb()
    .select({
      id: familyMembers.id,
      firstName: familyMembers.firstName,
      lastName: familyMembers.lastName,
    })
    .from(familyMembers)
    .innerJoin(registrations, eq(registrations.familyMemberId, familyMembers.id))
    .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(
      and(
        eq(locations.organizationId, auth.organizationId),
        or(ilike(familyMembers.firstName, term), ilike(familyMembers.lastName, term)),
      ),
    )
    .orderBy(familyMembers.lastName, familyMembers.firstName)
    .limit(FETCH_LIMIT);

  const seen = new Set<string>();
  const participants: Array<{ id: string; firstName: string; lastName: string }> = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    participants.push(row);
    if (participants.length >= MAX_RESULTS) break;
  }

  return new Response(JSON.stringify({ participants }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
