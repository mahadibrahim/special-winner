import type { APIRoute } from "astro";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { merchTeamKits } from "@/lib/db/schema";
import { requireOrgAdminAccess } from "@/lib/auth";
import { requireSameOrgTeam, ownershipDeniedResponse } from "@/lib/auth/require-resource-ownership";
import { listKits, generateShareToken } from "@/lib/merch/kits";

const kitSchema = z.object({
  teamId: z.string().uuid(),
  name: z.string().min(1).max(255),
  orderOpensAt: z.string().datetime().optional().nullable(),
  orderClosesAt: z.string().datetime().optional().nullable(),
  pickupLocation: z.string().max(2000).optional().nullable(),
  active: z.boolean().default(true),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  return json({ kits: await listKits(auth.organizationId) });
};

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const parsed = kitSchema.safeParse(await context.request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid", details: parsed.error.flatten() }, 400);
  const owns = await requireSameOrgTeam(auth.organizationId, parsed.data.teamId);
  if (!owns.ok) return ownershipDeniedResponse();
  const [kit] = await getDb().insert(merchTeamKits).values({
    organizationId: auth.organizationId,
    teamId: parsed.data.teamId,
    name: parsed.data.name,
    shareToken: generateShareToken(),
    orderOpensAt: parsed.data.orderOpensAt ? new Date(parsed.data.orderOpensAt) : null,
    orderClosesAt: parsed.data.orderClosesAt ? new Date(parsed.data.orderClosesAt) : null,
    pickupLocation: parsed.data.pickupLocation ?? null,
    active: parsed.data.active,
  }).returning();
  return json({ kit }, 201);
};

export const PUT: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const body = await context.request.json().catch(() => null);
  const id = body?.id;
  if (!id) return json({ error: "id required" }, 400);
  const parsed = kitSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Invalid", details: parsed.error.flatten() }, 400);
  const owns = await requireSameOrgTeam(auth.organizationId, parsed.data.teamId);
  if (!owns.ok) return ownershipDeniedResponse();
  const [kit] = await getDb().update(merchTeamKits).set({
    teamId: parsed.data.teamId,
    name: parsed.data.name,
    orderOpensAt: parsed.data.orderOpensAt ? new Date(parsed.data.orderOpensAt) : null,
    orderClosesAt: parsed.data.orderClosesAt ? new Date(parsed.data.orderClosesAt) : null,
    pickupLocation: parsed.data.pickupLocation ?? null,
    active: parsed.data.active,
    updatedAt: new Date(),
  }).where(and(eq(merchTeamKits.id, id), eq(merchTeamKits.organizationId, auth.organizationId))).returning();
  if (!kit) return json({ error: "Not found" }, 404);
  return json({ kit });
};

export const DELETE: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const id = new URL(context.request.url).searchParams.get("id");
  if (!id) return json({ error: "id required" }, 400);
  const [row] = await getDb().delete(merchTeamKits)
    .where(and(eq(merchTeamKits.id, id), eq(merchTeamKits.organizationId, auth.organizationId))).returning();
  if (!row) return json({ error: "Not found" }, 404);
  return json({ success: true });
};
