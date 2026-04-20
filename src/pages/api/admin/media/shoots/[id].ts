import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { shootSessions } from "@/lib/db/schema/media";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdminAccess } from "@/lib/auth";
import { logMediaAction } from "@/lib/media/audit";
import { notifyAssignment } from "@/lib/media/notifications";

const patchSchema = z.object({
  assignedUserId: z.string().uuid().optional(),
  scheduledStart: z.string().datetime().optional(),
  scheduledEnd: z.string().datetime().optional(),
  locationId: z.string().uuid().nullable().optional(),
  venueId: z.string().uuid().nullable().optional(),
  gameId: z.string().uuid().nullable().optional(),
  rateType: z.enum(["per_game", "per_day", "flat"]).optional(),
  rateCents: z.number().int().nonnegative().optional(),
  notes: z.string().nullable().optional(),
  status: z
    .enum([
      "assigned",
      "confirmed",
      "checked_in",
      "uploading",
      "uploaded",
      "tagging",
      "ready",
      "published",
      "cancelled",
    ])
    .optional(),
});

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const id = context.params.id!;
  const [row] = await getDb()
    .select()
    .from(shootSessions)
    .where(eq(shootSessions.id, id))
    .limit(1);
  if (!row)
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
  return new Response(JSON.stringify({ session: row }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

export const PATCH: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const id = context.params.id!;
  const body = await context.request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      }),
      { status: 400 }
    );
  }

  const [before] = await getDb()
    .select()
    .from(shootSessions)
    .where(eq(shootSessions.id, id))
    .limit(1);
  if (!before)
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    if (k === "scheduledStart" || k === "scheduledEnd") {
      patch[k] = new Date(v as string);
    } else {
      patch[k] = v;
    }
  }

  const [updated] = await getDb()
    .update(shootSessions)
    .set(patch)
    .where(eq(shootSessions.id, id))
    .returning();

  await logMediaAction({
    actorUserId: auth.user.id,
    entityType: "session",
    entityId: id,
    action: "update",
    diff: { before, after: updated },
  });

  // Reassignment triggers a notification to the new photographer.
  if (
    parsed.data.assignedUserId &&
    parsed.data.assignedUserId !== before.assignedUserId
  ) {
    await notifyAssignment(updated, parsed.data.assignedUserId);
  }

  return new Response(JSON.stringify({ session: updated }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
