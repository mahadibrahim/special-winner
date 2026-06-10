/** PUT /api/admin/memberships/tiers/reorder → set displayOrder from an ordered id list. */
import type { APIRoute } from "astro";
import { eq, and, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { membershipTiers } from "@/lib/db/schema/memberships";
import { requireAdminAccess } from "@/lib/auth/roles";

export const prerender = false;
const json = (b: unknown, s: number) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

export const PUT: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = context.locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);

  let raw: { ids?: unknown };
  try { raw = await context.request.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const ids = raw.ids;
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string")) {
    return json({ error: "ids must be an array of strings" }, 400);
  }

  const db = getDb();
  // All ids must belong to the active org, or reject the whole request.
  const owned = await db
    .select({ id: membershipTiers.id })
    .from(membershipTiers)
    .where(and(eq(membershipTiers.organizationId, orgId), inArray(membershipTiers.id, ids as string[])));
  if (owned.length !== ids.length) return json({ error: "One or more tiers not found in this org" }, 404);

  await db.transaction(async (tx) => {
    for (let i = 0; i < ids.length; i++) {
      await tx
        .update(membershipTiers)
        .set({ displayOrder: i, updatedAt: new Date() })
        .where(eq(membershipTiers.id, ids[i] as string));
    }
  });
  return json({ ok: true }, 200);
};
