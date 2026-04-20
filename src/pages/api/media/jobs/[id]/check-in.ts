import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { shootSessions } from "@/lib/db/schema/media";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  requireMediaStaffAccess,
  loadAssignedSession,
} from "@/lib/media/permissions";
import { logMediaAction } from "@/lib/media/audit";

const schema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const POST: APIRoute = async (context) => {
  const guard = await requireMediaStaffAccess(context);
  if (!guard.authorized) return guard.response;
  const id = context.params.id!;

  const session = await loadAssignedSession(guard.userId, id);
  if (!session)
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });

  const body = await context.request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      }),
      { status: 400 }
    );
  }

  const [updated] = await getDb()
    .update(shootSessions)
    .set({
      status: "checked_in",
      checkedInAt: new Date(),
      checkedInLat: parsed.data.lat.toFixed(6),
      checkedInLng: parsed.data.lng.toFixed(6),
      updatedAt: new Date(),
    })
    .where(eq(shootSessions.id, id))
    .returning();

  await logMediaAction({
    actorUserId: guard.userId,
    entityType: "session",
    entityId: id,
    action: "update",
    diff: { status: "checked_in", lat: parsed.data.lat, lng: parsed.data.lng },
  });

  return new Response(JSON.stringify({ session: updated }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
