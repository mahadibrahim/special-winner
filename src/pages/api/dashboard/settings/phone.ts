import type { APIRoute } from "astro";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import { recordPhoneOptIn } from "@/lib/sms/opt-in";

/**
 * POST /api/dashboard/settings/phone
 *
 * Persists a verified phone number on the current user's profile.
 * Called by the settings PhoneVerificationClient after the OTP flow
 * succeeds. Also records phone_opt_ins state for the user's organization:
 * opted_in only when the customer checked the SmsConsentCheckbox, else a
 * pending record (existing opted_in is never downgraded).
 *
 * Body:
 *   - phone: E.164 phone number (already verified by the OTP endpoint)
 *   - verified: must be true (defensive — this endpoint only accepts
 *     already-verified phones)
 *   - smsConsent: whether the consent checkbox was affirmatively checked.
 *     Defaults to false — consent is never assumed.
 */

const bodySchema = z.object({
  phone: z.string().min(7).max(20),
  verified: z.literal(true),
  smsConsent: z.boolean().optional().default(false),
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

  // Record opt-in state for the current organization, if we have org context.
  const organization = (
    locals as unknown as { organization?: { id: string } | null }
  ).organization;

  if (organization?.id) {
    await recordPhoneOptIn({
      db,
      organizationId: organization.id,
      userId: user.id,
      phone: parsed.data.phone,
      consented: parsed.data.smsConsent,
      source: "verify_phone_form",
    });
  }

  return json({ success: true });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
