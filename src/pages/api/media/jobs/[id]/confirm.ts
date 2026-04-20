import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { shootSessions } from "@/lib/db/schema/media";
import { eq } from "drizzle-orm";
import {
  requireMediaStaffAccess,
  loadAssignedSession,
} from "@/lib/media/permissions";
import { logMediaAction } from "@/lib/media/audit";

export const POST: APIRoute = async (context) => {
  const guard = await requireMediaStaffAccess(context);
  if (!guard.authorized) return guard.response;
  const id = context.params.id!;

  const session = await loadAssignedSession(guard.userId, id);
  if (!session)
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });

  if (session.status !== "assigned") {
    return new Response(
      JSON.stringify({ error: "Session is not in 'assigned' state" }),
      { status: 409 }
    );
  }

  const [updated] = await getDb()
    .update(shootSessions)
    .set({
      status: "confirmed",
      confirmedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(shootSessions.id, id))
    .returning();

  await logMediaAction({
    actorUserId: guard.userId,
    entityType: "session",
    entityId: id,
    action: "update",
    diff: { status: "confirmed" },
  });

  return new Response(JSON.stringify({ session: updated }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
