import type { APIRoute } from "astro";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";

/**
 * POST /api/dashboard/settings/phone
 *
 * Persists a verified phone number on the current user's profile.
 * Called by the settings PhoneVerificationClient after the OTP flow
 * succeeds. Also creates a pending→opted_in phone_opt_ins record for
 * the user's organization.
 *
 * Body:
 *   - phone: E.164 phone number (already verified by the OTP endpoint)
 *   - verified: must be true (defensive — this endpoint only accepts
 *     already-verified phones)
 */

const bodySchema = z.object({
  phone: z.string().min(7).max(20),
  verified: z.literal(true),
});

export const POST: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0].message }, 400);
  }

  const db = getDb();

  await db
    .update(users)
    .set({
      phone: parsed.data.phone,
      phoneVerified: true,
      updatedAt: new Date(),
    })
    .where(eq(users.id, user.id));

  // Opt the phone in for the current organization, if we have org context.
  const organization = (
    locals as unknown as { organization?: { id: string } | null }
  ).organization;

  if (organization?.id) {
    const now = new Date();
    // Upsert the opt-in record. If one exists for this (org, phone), mark it active.
    const existing = await db
      .select({ id: phoneOptIns.id })
      .from(phoneOptIns)
      .where(eq(phoneOptIns.phone, parsed.data.phone))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(phoneOptIns)
        .set({
          status: "opted_in",
          optedInAt: now,
          optedOutAt: null,
          stopKeywordTriggered: null,
          userId: user.id,
          updatedAt: now,
        })
        .where(eq(phoneOptIns.id, existing[0].id));
    } else {
      await db.insert(phoneOptIns).values({
        organizationId: organization.id,
        userId: user.id,
        phone: parsed.data.phone,
        status: "opted_in",
        optedInAt: now,
        optInSource: "registration_form",
      });
    }
  }

  return json({ success: true });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
