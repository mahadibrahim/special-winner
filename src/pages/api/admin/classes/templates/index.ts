/**
 * GET  /api/admin/classes/templates → list class-slot templates for the active org.
 * POST /api/admin/classes/templates → create a template.
 */
import type { APIRoute } from "astro";
import { eq, asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classSlotTemplates } from "@/lib/db/schema/classes";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { requireSameOrgVenue } from "@/lib/auth/require-resource-ownership";
import { dollarsToCents } from "@/lib/memberships/tier-units";
import { templateInputSchema } from "@/lib/classes/admin-templates";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  const db = getDb();
  const templates = await db
    .select()
    .from(classSlotTemplates)
    .where(eq(classSlotTemplates.organizationId, orgId))
    .orderBy(asc(classSlotTemplates.createdAt));
  return json({ templates }, 200);
};

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  let raw: unknown;
  try {
    raw = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = templateInputSchema.safeParse(raw);
  if (!parsed.success) return json({ error: "Validation failed", details: parsed.error.flatten() }, 422);
  const input = parsed.data;

  const venueCheck = await requireSameOrgVenue(orgId, input.venueId);
  if (!venueCheck.ok) return json({ error: "Venue not found" }, 404);

  const db = getDb();
  const [template] = await db
    .insert(classSlotTemplates)
    .values({
      organizationId: orgId,
      venueId: input.venueId,
      name: input.name,
      sportLabel: input.sportLabel,
      minAge: input.minAge,
      maxAge: input.maxAge,
      weekday: input.weekday,
      startTime: input.startTime,
      durationMins: input.durationMins,
      capacity: input.capacity,
      sessionRateCents: dollarsToCents(input.sessionRateDollars),
      memberRateCents: dollarsToCents(input.memberRateDollars),
      blockRateCents: dollarsToCents(input.blockRateDollars),
      active: input.active,
    })
    .returning();
  return json({ template }, 201);
};
