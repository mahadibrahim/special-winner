import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInRateCard } from "@/lib/db/schema/drop-in";
import { requireHostOfSession } from "@/lib/auth/host";
import { removeHostFromSession } from "@/lib/dropin/host-assignment";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * POST /api/host/games/:id/unclaim — release a game I host. Blocked inside
 * the org's cancel window (rate card cancelWindowHours) so games don't
 * silently lose their host last-minute; inside the window the host must
 * contact the org (admin remove still works).
 */
export const POST: APIRoute = async (context) => {
  const id = context.params.id;
  if (!id) return json({ error: "session id required" }, 400);

  const auth = await requireHostOfSession(context, id);
  if (!auth.authorized) return auth.response;

  const [rateCard] = await getDb()
    .select({ cancelWindowHours: dropInRateCard.cancelWindowHours })
    .from(dropInRateCard)
    .where(eq(dropInRateCard.organizationId, auth.organizationId))
    .limit(1);
  const cancelWindowHours = rateCard?.cancelWindowHours ?? 24;
  const cutoff = new Date(
    auth.session.startsAt.getTime() - cancelWindowHours * 60 * 60 * 1000,
  );
  if (new Date() > cutoff) {
    return json(
      {
        error: "Too close to game time to step down — contact the front desk",
        code: "cutoff_passed",
        cancelWindowHours,
      },
      409,
    );
  }

  await removeHostFromSession({ sessionId: id, reason: "host_unclaimed" });
  return json({ ok: true }, 200);
};
