import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  shootSessions,
  type NewShootSession,
} from "@/lib/db/schema/media";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { logMediaAction } from "@/lib/media/audit";
import { notifyAssignment } from "@/lib/media/notifications";

const createSchema = z.object({
  assignedUserId: z.string().uuid(),
  locationId: z.string().uuid().optional(),
  gameId: z.string().uuid().optional(),
  venueId: z.string().uuid().optional(),
  sessionType: z.enum(["game", "team_posed", "practice", "event"]),
  scheduledStart: z.string().datetime(),
  scheduledEnd: z.string().datetime(),
  rateType: z.enum(["per_game", "per_day", "flat"]).optional(),
  rateCents: z.number().int().nonnegative().optional(),
  notes: z.string().optional(),
});

export const GET: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const org = await requireOrganizationContext(context);
  if (!org.hasOrganization) return org.response;

  const url = new URL(context.request.url);
  const status = url.searchParams.get("status");
  const locationId = url.searchParams.get("locationId");
  const assignedUserId = url.searchParams.get("assignedUserId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const conditions = [eq(shootSessions.organizationId, org.organizationId)];
  if (status) conditions.push(eq(shootSessions.status, status as any));
  if (locationId) conditions.push(eq(shootSessions.locationId, locationId));
  if (assignedUserId)
    conditions.push(eq(shootSessions.assignedUserId, assignedUserId));
  if (from) conditions.push(gte(shootSessions.scheduledStart, new Date(from)));
  if (to) conditions.push(lte(shootSessions.scheduledStart, new Date(to)));

  const rows = await getDb()
    .select()
    .from(shootSessions)
    .where(and(...conditions))
    .orderBy(desc(shootSessions.scheduledStart))
    .limit(500);

  return new Response(JSON.stringify({ sessions: rows }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const POST: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const org = await requireOrganizationContext(context);
  if (!org.hasOrganization) return org.response;

  const body = await context.request.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      }),
      { status: 400 }
    );
  }

  const values: NewShootSession = {
    organizationId: org.organizationId,
    assignedUserId: parsed.data.assignedUserId,
    assignedByUserId: auth.user.id,
    locationId: parsed.data.locationId ?? null,
    gameId: parsed.data.gameId ?? null,
    venueId: parsed.data.venueId ?? null,
    sessionType: parsed.data.sessionType,
    scheduledStart: new Date(parsed.data.scheduledStart),
    scheduledEnd: new Date(parsed.data.scheduledEnd),
    rateType: parsed.data.rateType ?? null,
    rateCents: parsed.data.rateCents ?? null,
    notes: parsed.data.notes ?? null,
    status: "assigned",
    payoutStatus: "unearned",
  };

  const [created] = await getDb().insert(shootSessions).values(values).returning();

  await logMediaAction({
    actorUserId: auth.user.id,
    entityType: "session",
    entityId: created.id,
    action: "create",
    diff: { after: created },
  });

  if (created.assignedUserId) {
    await notifyAssignment(created, created.assignedUserId);
  }

  return new Response(JSON.stringify({ session: created }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
