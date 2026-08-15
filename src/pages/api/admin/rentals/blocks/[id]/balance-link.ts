/**
 * POST /api/admin/rentals/blocks/:id/balance-link
 *
 * Send the balance ask now, rather than waiting for the reminder schedule.
 * Same token and same page as the deposit link - it just serves the second
 * leg once the deposit has landed.
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

  if (block.status !== "active") {
    return json(
      { error: `This block is ${block.status.replace(/_/g, " ")}, so no balance is owed yet` },
      422,
    );
  }
  if (block.balancePaidAt !== null || block.balanceDueCents === 0) {
    return json({ error: "This block has no balance outstanding" }, 422);
  }
  if (!block.renterEmail && !block.renterPhone) {
    return json({ error: "This block has no renter email or phone on file" }, 422);
  }

  const result = await dispatchBlockQuote(blockId, "balance");
  if (!result.ok) {
    return json({ error: result.reason ?? "Could not send the balance link" }, 502);
  }
  return json({ sent: true, channel: result.channel }, 200);
};
