/**
 * GET  /api/dropin/claim/:token  → returns the pending-claim booking
 *                                  metadata so the UI can show the user
 *                                  what they're claiming.
 * POST /api/dropin/claim/:token  → completes the claim. For free-path
 *                                  bookings the row already carries the
 *                                  paid state from earlier — we simply
 *                                  flip pending_claim → confirmed and
 *                                  clear the token. For paid claims the
 *                                  caller follows up with /api/dropin/bookings
 *                                  to get a Checkout Session URL using
 *                                  this booking row's amount.
 *
 * Token is one-time: clearing it on POST blocks replay.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { findClaimByToken } from "@/lib/dropin/promotion";
import { assignTeam } from "@/lib/dropin/team-assignment";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function loadClaimWithOrg(token: string) {
  const row = await findClaimByToken(token);
  if (!row) return { row: null, sessionOrgId: null };
  const db = getDb();
  const [session] = await db
    .select({ organizationId: dropInSessions.organizationId })
    .from(dropInSessions)
    .where(eq(dropInSessions.id, row.sessionId))
    .limit(1);
  return { row, sessionOrgId: session?.organizationId ?? null };
}

export const GET: APIRoute = async ({ params, locals }) => {
  const token = params.token;
  if (!token) return json({ error: "Token required" }, 400);

  const { row, sessionOrgId } = await loadClaimWithOrg(token);
  if (!row) return json({ error: "Token invalid" }, 404);
  if (row.expired) return json({ error: "Window expired" }, 410);
  if (locals.organization && sessionOrgId !== locals.organization.id) {
    // Don't leak that the token exists for a different org — same shape as not-found.
    return json({ error: "Token invalid" }, 404);
  }

  return json(
    {
      bookingId: row.id,
      sessionId: row.sessionId,
      userId: row.userId,
      promotionExpiresAt: row.promotionExpiresAt,
      paymentMethod: row.paymentMethod,
      amountPaidCents: row.amountPaidCents,
    },
    200,
  );
};

export const POST: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);

  const token = params.token;
  if (!token) return json({ error: "Token required" }, 400);

  const { row, sessionOrgId } = await loadClaimWithOrg(token);
  if (!row) return json({ error: "Token invalid" }, 404);
  if (row.expired) return json({ error: "Window expired" }, 410);
  if (locals.organization && sessionOrgId !== locals.organization.id) {
    return json({ error: "Token invalid" }, 404);
  }
  if (row.userId !== locals.user.id) {
    return json({ error: "This claim is for a different user" }, 403);
  }

  const db = getDb();
  return await db.transaction(async (tx) => {
    // Re-lock the row inside the transaction.
    const [locked] = await tx
      .select()
      .from(dropInBookings)
      .where(eq(dropInBookings.id, row.id))
      .limit(1)
      .for("update");
    if (!locked || locked.status !== "pending_claim") {
      return json({ error: "Claim no longer valid" }, 409);
    }

    // Re-run team assignment with the now-current confirmed roster.
    // (Pure-function call; takes a session shape — fetch the parent.)
    const [sessionRow] = await tx
      .select()
      .from(dropInSessions)
      .where(eq(dropInSessions.id, locked.sessionId))
      .limit(1);
    if (!sessionRow) return json({ error: "Session not found" }, 404);

    const team = assignTeam(sessionRow, "all_levels", []);

    await tx
      .update(dropInBookings)
      .set({
        status: "confirmed",
        promotionToken: null,
        teamAssignment: locked.teamAssignment ?? team,
        updatedAt: new Date(),
      })
      .where(eq(dropInBookings.id, locked.id));

    return json({ ok: true, bookingId: locked.id }, 200);
  });
};
