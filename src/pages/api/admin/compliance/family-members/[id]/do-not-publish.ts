import type { APIRoute } from "astro";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireOrgAdminAccess } from "@/lib/auth";
import {
  requireSameOrgFamilyMember,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";
import { setDoNotPublish, clearDoNotPublish } from "@/lib/consents/do-not-publish";

/**
 * PUT/DELETE /api/admin/compliance/family-members/:id/do-not-publish
 *
 * Per-individual media opt-out toggle (product-backlog build #3). This is
 * NOT a team-level gate — see src/lib/consents/publish-check.ts for how the
 * flag is consumed (face-tag path only).
 */

const putSchema = z.object({
  reason: z.string().trim().min(1).max(2000).optional(),
});

export const PUT: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const familyMemberId = context.params.id!;
  const ownership = await requireSameOrgFamilyMember(
    auth.organizationId,
    familyMemberId,
  );
  if (!ownership.ok) return ownershipDeniedResponse();

  let body: unknown = {};
  const raw = await context.request.text();
  if (raw) {
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
  }
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      400,
    );
  }

  await setDoNotPublish({
    db: getDb(),
    organizationId: auth.organizationId,
    familyMemberId,
    reason: parsed.data.reason ?? null,
    setByUserId: auth.user.id,
  });

  return json({
    familyMemberId,
    doNotPublish: { active: true, reason: parsed.data.reason ?? null },
  });
};

export const DELETE: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const familyMemberId = context.params.id!;
  const ownership = await requireSameOrgFamilyMember(
    auth.organizationId,
    familyMemberId,
  );
  if (!ownership.ok) return ownershipDeniedResponse();

  await clearDoNotPublish({
    db: getDb(),
    organizationId: auth.organizationId,
    familyMemberId,
    removedByUserId: auth.user.id,
  });

  return json({ familyMemberId, doNotPublish: { active: false } });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
