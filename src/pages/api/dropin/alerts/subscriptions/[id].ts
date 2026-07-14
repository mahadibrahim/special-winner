import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { pickupAlertSubscriptions } from "@/lib/db/schema/hosts";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const DELETE: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: "Unauthorized" }, 401);
  const id = params.id;
  if (!id) return json({ error: "id required" }, 400);

  const [updated] = await getDb()
    .update(pickupAlertSubscriptions)
    .set({ active: false, unsubscribedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(pickupAlertSubscriptions.id, id),
        eq(pickupAlertSubscriptions.userId, user.id),
      ),
    )
    .returning({ id: pickupAlertSubscriptions.id });
  if (!updated) return json({ error: "Not found" }, 404);
  return json({ ok: true }, 200);
};
