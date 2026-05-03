import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { consents, familyMembers } from "@/lib/db/schema";
import { and, desc, eq, or, sql } from "drizzle-orm";

/**
 * GET /api/consents/family-members/[id]
 *
 * Returns the most-recent consent row for each (type, scope) tuple for a
 * family_member, scoped to the requesting user (must be parent or self of
 * the family_member). Admins are NOT given access here on purpose — they
 * use /api/admin/compliance/family-members which surfaces a different view.
 */
export const GET: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: "Unauthorized" }, 401);

  const familyMemberId = params.id;
  if (!familyMemberId) return json({ error: "Missing id" }, 400);

  const db = getDb();
  const [member] = await db
    .select()
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.id, familyMemberId),
        or(
          eq(familyMembers.parentUserId, user.id),
          eq(familyMembers.selfUserId, user.id),
        ),
      ),
    )
    .limit(1);
  if (!member) return json({ error: "Not found" }, 404);

  const rows = await db
    .select()
    .from(consents)
    .where(eq(consents.familyMemberId, familyMemberId))
    .orderBy(desc(consents.signedAt));

  // Reduce to most recent per (type, scope) tuple.
  const latest = new Map<string, (typeof consents.$inferSelect)>();
  for (const r of rows) {
    const k = `${r.type}|${r.scope ?? ""}`;
    if (!latest.has(k)) latest.set(k, r);
  }

  return json({
    familyMember: {
      id: member.id,
      firstName: member.firstName,
      lastName: member.lastName,
      kind: member.selfUserId ? "self" : "dependent",
    },
    consents: Array.from(latest.values()).map((c) => ({
      id: c.id,
      type: c.type,
      scope: c.scope,
      status: c.status,
      signedAt: c.signedAt,
      expiresAt: c.expiresAt,
      signedByName: c.signedByName,
    })),
  });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
