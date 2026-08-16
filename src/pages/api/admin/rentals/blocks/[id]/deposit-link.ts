/**
 * POST /api/admin/rentals/blocks/:id/deposit-link
 *
 * Send (or resend) the renter the deposit ask. The token is minted
 * idempotently, so every copy of this email points at the same page, and the
 * Checkout Session itself is minted on demand when the renter clicks - a
 * resent link can never carry a stale Stripe session.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentalBlocks } from "@/lib/db/schema/field-rental-blocks";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { ownershipDeniedResponse } from "@/lib/auth/require-resource-ownership";
import { dispatchBlockQuote } from "@/lib/rentals/blocks/messages";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const blockId = context.params.id;
  if (!blockId) return json({ error: "block id required" }, 400);

  const [block] = await getDb()
    .select()
    .from(fieldRentalBlocks)
    .where(eq(fieldRentalBlocks.id, blockId))
    .limit(1);
  if (!block || block.organizationId !== auth.organizationId) {
    return ownershipDeniedResponse();
  }

  if (block.status !== "awaiting_deposit") {
    return json(
      { error: `This block is ${block.status.replace(/_/g, " ")}, not awaiting a deposit` },
      422,
    );
  }
  if (!block.renterEmail && !block.renterPhone) {
    return json({ error: "This block has no renter email or phone on file" }, 422);
  }

  const result = await dispatchBlockQuote(blockId, "deposit");
  if (!result.ok) {
    return json({ error: result.reason ?? "Could not send the deposit link" }, 502);
  }
  return json({ sent: true, channel: result.channel }, 200);
};
