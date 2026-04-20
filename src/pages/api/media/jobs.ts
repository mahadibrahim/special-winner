import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { shootSessions } from "@/lib/db/schema/media";
import { desc, eq } from "drizzle-orm";
import { requireMediaStaffAccess } from "@/lib/media/permissions";

export const GET: APIRoute = async (context) => {
  const guard = await requireMediaStaffAccess(context);
  if (!guard.authorized) return guard.response;

  const rows = await getDb()
    .select()
    .from(shootSessions)
    .where(eq(shootSessions.assignedUserId, guard.userId))
    .orderBy(desc(shootSessions.scheduledStart));

  return new Response(JSON.stringify({ jobs: rows }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
