import type { APIRoute } from "astro";
import { eq, and, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { consents, familyMembers } from "@/lib/db/schema";
import { recordConsent } from "@/lib/consents/record";

/**
 * POST /api/consents/[id]/revoke
 *
 * Writes a new consent row of status='revoked' superseding the referenced
 * consent. Caller must be the parent or self of the consent's family_member.
 *
 * Some consent types cannot be revoked (parental, age_confirmation,
 * liability) — only media_authorization scopes can be turned off after the
 * fact. Revoking those would invalidate registrations / waivers and require
 * admin intervention. A 422 is returned for those types.
 */
export const POST: APIRoute = async ({ params, request, clientAddress, locals }) => {
  const user = locals.user;
  if (!user) return json({ error: "Unauthorized" }, 401);

  const consentId = params.id;
  if (!consentId) return json({ error: "Missing id" }, 400);

  const db = getDb();
  const [target] = await db
    .select()
    .from(consents)
    .where(eq(consents.id, consentId))
    .limit(1);
  if (!target) return json({ error: "Not found" }, 404);

  // Authorization: requester must own the family_member.
  const [member] = await db
    .select()
    .from(familyMembers)
    .where(
      and(
        eq(familyMembers.id, target.familyMemberId),
        or(
          eq(familyMembers.parentUserId, user.id),
          eq(familyMembers.selfUserId, user.id),
        ),
      ),
    )
    .limit(1);
  if (!member) return json({ error: "Not found" }, 404);

  if (target.type !== "media_authorization") {
    return json(
      {
        error:
          "This consent type cannot be revoked online. Contact support to remove it.",
      },
      422,
    );
  }

  const userAgent = request.headers.get("user-agent");
  const signerName = [user.firstName, user.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  const result = await recordConsent({
    db,
    familyMemberId: target.familyMemberId,
    organizationId: null,
    type: "media_authorization",
    scope: target.scope ?? undefined,
    status: "revoked",
    signedByUserId: user.id,
    signedByName: signerName || user.email,
    ipAddress: clientAddress ?? null,
    userAgent: userAgent ?? null,
    notes: `revoke of consent ${target.id}`,
  });

  return json({ revokedConsentId: result.id });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
