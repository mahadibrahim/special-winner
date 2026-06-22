/**
 * GET /api/admin/rentals/rate-card → org's field-rental rate card (creates
 *                                    a default row if missing).
 * PUT /api/admin/rentals/rate-card → upsert with validation.
 *
 * Mirrors src/pages/api/admin/dropin/rate-card.ts.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentalRateCard } from "@/lib/db/schema/field-rentals";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import {
  validateRentalRateCardPut,
  type RentalRateCardPutBody,
} from "@/lib/rentals/validators";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  const db = getDb();
  let [row] = await db
    .select()
    .from(fieldRentalRateCard)
    .where(eq(fieldRentalRateCard.organizationId, orgId))
    .limit(1);

  if (!row) {
    [row] = await db
      .insert(fieldRentalRateCard)
      .values({ organizationId: orgId })
      .returning();
  }

  return json({ rateCard: row }, 200);
};

export const PUT: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  let body: RentalRateCardPutBody;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const err = validateRentalRateCardPut(body);
  if (err) return json({ error: err }, 400);

  const db = getDb();
  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
    updatedByUserId: auth.user.id,
  };
  for (const key of [
    "defaultHourlyRateCents",
    "cancelWindowHours",
    "bookingIncrementMinutes",
    "minDurationMinutes",
    "maxDurationMinutes",
  ] as const) {
    if (body[key] !== undefined) updates[key] = body[key];
  }

  // Upsert: insert if missing, update if present.
  const [existing] = await db
    .select({ id: fieldRentalRateCard.id })
    .from(fieldRentalRateCard)
    .where(eq(fieldRentalRateCard.organizationId, orgId))
    .limit(1);

  let row;
  if (existing) {
    [row] = await db
      .update(fieldRentalRateCard)
      .set(updates)
      .where(eq(fieldRentalRateCard.organizationId, orgId))
      .returning();
  } else {
    [row] = await db
      .insert(fieldRentalRateCard)
      .values({ organizationId: orgId, ...updates })
      .returning();
  }
  return json({ rateCard: row }, 200);
};
