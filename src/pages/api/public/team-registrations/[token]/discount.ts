import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { teamRegistrations, discountCodes, discountUsages } from "@/lib/db/schema";
import { and, eq, isNull, sql, desc } from "drizzle-orm";
import { z } from "zod";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { checkDiscountEligibility, computeDiscountCents } from "@/lib/discounts/validate";

const BodySchema = z.object({
  code: z.string().trim().min(1).max(50),
});

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Load the team behind an invite token and confirm the caller is its captain.
 * The invite token is the shared JOIN link (teammates hold it), so a token
 * alone must never authorize a money change — only the signed-in captain can
 * touch the team fee. Cross-tenant access is a 404, matching sibling handlers.
 */
type LoadedTeam = {
  id: string;
  organizationId: string;
  seasonId: string;
  captainUserId: string | null;
  teamFeeCents: number | null;
  depositCents: number | null;
  discountCodeId: string | null;
  discountCents: number | null;
  backstopStatus: string;
};

async function loadCaptainTeam(
  token: string,
  locals: App.Locals,
): Promise<{ ok: true; team: LoadedTeam } | { ok: false; response: Response }> {
  if (!db) return { ok: false, response: json({ error: "Database unavailable" }, 503) };
  const [team] = await db
    .select({
      id: teamRegistrations.id,
      organizationId: teamRegistrations.organizationId,
      seasonId: teamRegistrations.seasonId,
      captainUserId: teamRegistrations.captainUserId,
      teamFeeCents: teamRegistrations.teamFeeCents,
      depositCents: teamRegistrations.depositCents,
      discountCodeId: teamRegistrations.discountCodeId,
      discountCents: teamRegistrations.discountCents,
      backstopStatus: teamRegistrations.backstopStatus,
    })
    .from(teamRegistrations)
    .where(eq(teamRegistrations.inviteToken, token))
    .limit(1);

  if (!team) return { ok: false, response: json({ error: "Team not found" }, 404) };
  if (!locals.organization || team.organizationId !== locals.organization.id) {
    return { ok: false, response: json({ error: "Not found" }, 404) };
  }
  if (!locals.user || locals.user.id !== team.captainUserId) {
    return { ok: false, response: json({ error: "Only the team captain can change the team fee" }, 403) };
  }
  // A discount only makes sense before the deposit is settled — after that the
  // roster split and any backstop charge are in motion.
  if (team.backstopStatus !== "none") {
    return { ok: false, response: json({ error: "This team is already reserved — the fee can't be changed" }, 409) };
  }
  return { ok: true, team };
}

/** Reverse a previously-recorded team discount usage (best-effort): remove one
 *  matching usage row and decrement the code's counter, floored at zero. */
async function reverseUsage(discountCodeId: string, userId: string) {
  if (!db) return;
  const [row] = await db
    .select({ id: discountUsages.id })
    .from(discountUsages)
    .where(
      and(
        eq(discountUsages.discountCodeId, discountCodeId),
        eq(discountUsages.userId, userId),
        isNull(discountUsages.registrationId),
      ),
    )
    .orderBy(desc(discountUsages.usedAt))
    .limit(1);
  if (row) {
    await db.delete(discountUsages).where(eq(discountUsages.id, row.id));
    await db
      .update(discountCodes)
      .set({ usedCount: sql`GREATEST(${discountCodes.usedCount} - 1, 0)` })
      .where(eq(discountCodes.id, discountCodeId));
  }
}

// POST — apply a discount code to the team fee.
export const POST: APIRoute = async ({ params, request, clientAddress, locals }) => {
  const token = params.token;
  if (!token) return json({ error: "Missing token" }, 400);
  if (!db) return json({ error: "Database unavailable" }, 503);

  const ip = clientAddress || "unknown";
  const limit = rateLimit(`team-discount:ip:${ip}`, 20, 60_000);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfter ?? 60);

  let parsed;
  try {
    parsed = BodySchema.safeParse(await request.json());
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!parsed.success) return json({ error: "Enter a discount code" }, 400);

  const loaded = await loadCaptainTeam(token, locals);
  if (!loaded.ok) return loaded.response;
  const { team } = loaded;

  if (team.teamFeeCents == null) {
    return json({ error: "This team has no fee to discount" }, 400);
  }

  // Original (pre-discount) fee: add back any discount already applied so
  // re-applying a different code prices off the true fee, not a stacked one.
  const originalFeeCents = team.teamFeeCents + (team.discountCents ?? 0);
  const depositCents = team.depositCents ?? 0;

  const eligibility = await checkDiscountEligibility(db, {
    code: parsed.data.code,
    organizationId: team.organizationId,
    seasonId: team.seasonId,
    purchaseAmountCents: originalFeeCents,
    userId: team.captainUserId ?? undefined,
  });
  if (!eligibility.ok) return json({ applied: false, error: eligibility.error }, 200);

  const discountCents = computeDiscountCents(eligibility.code, originalFeeCents);
  const newFeeCents = originalFeeCents - discountCents;

  // The deposit is paid today and credited toward the roster; a discount can't
  // pull the team total to or below it, or the roster would owe nothing/negative.
  if (newFeeCents <= depositCents) {
    return json(
      { applied: false, error: "This code would reduce the team total below the $200 deposit." },
      200,
    );
  }

  // Already-applied same code → idempotent no-op (don't double-count usage).
  if (team.discountCodeId === eligibility.code.id) {
    return json({ applied: true, code: eligibility.code.code, discountCents, teamFeeCents: newFeeCents }, 200);
  }

  // Replacing a different code: reverse its usage before recording the new one.
  if (team.discountCodeId) {
    await reverseUsage(team.discountCodeId, team.captainUserId ?? "");
  }

  await db
    .update(teamRegistrations)
    .set({
      teamFeeCents: newFeeCents,
      discountCodeId: eligibility.code.id,
      discountCents,
      updatedAt: new Date(),
    })
    .where(eq(teamRegistrations.id, team.id));

  // Record the redemption so total + per-user caps hold across teams.
  await db.insert(discountUsages).values({
    discountCodeId: eligibility.code.id,
    userId: team.captainUserId ?? "",
    registrationId: null,
    discountAmountCents: discountCents,
  });
  await db
    .update(discountCodes)
    .set({ usedCount: sql`${discountCodes.usedCount} + 1` })
    .where(eq(discountCodes.id, eligibility.code.id));

  return json({ applied: true, code: eligibility.code.code, discountCents, teamFeeCents: newFeeCents }, 200);
};

// DELETE — remove an applied discount, restoring the full team fee.
export const DELETE: APIRoute = async ({ params, clientAddress, locals }) => {
  const token = params.token;
  if (!token) return json({ error: "Missing token" }, 400);
  if (!db) return json({ error: "Database unavailable" }, 503);

  const ip = clientAddress || "unknown";
  const limit = rateLimit(`team-discount:ip:${ip}`, 20, 60_000);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfter ?? 60);

  const loaded = await loadCaptainTeam(token, locals);
  if (!loaded.ok) return loaded.response;
  const { team } = loaded;

  const restoredFeeCents = (team.teamFeeCents ?? 0) + (team.discountCents ?? 0);

  if (!team.discountCodeId) {
    return json({ applied: false, teamFeeCents: team.teamFeeCents }, 200);
  }

  await db
    .update(teamRegistrations)
    .set({ teamFeeCents: restoredFeeCents, discountCodeId: null, discountCents: null, updatedAt: new Date() })
    .where(eq(teamRegistrations.id, team.id));

  await reverseUsage(team.discountCodeId, team.captainUserId ?? "");

  return json({ applied: false, teamFeeCents: restoredFeeCents }, 200);
};
