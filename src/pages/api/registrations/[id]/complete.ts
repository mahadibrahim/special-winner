import type { APIRoute } from "astro";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  registrations,
  familyMembers,
  users,
  seasons,
  programs,
  locations,
  ageGroups,
} from "@/lib/db/schema";
import {
  recordConsent,
  recordDefaultMediaAuth,
  hasActiveConsent,
} from "@/lib/consents/record";
import { recordPhoneOptIn } from "@/lib/sms/opt-in";
import { recordMarketingConsent } from "@/lib/consents/marketing";
import { CONSENT_COPY } from "@/lib/consents/marketing-channels";
import { getPostHogServer } from "@/lib/posthog-server";
import { SERVER_EVENTS } from "@/lib/analytics/events";

const bodySchema = z.object({
  waiverAccepted: z.literal(true),
  waiverSignature: z.string().min(2),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  phone: z.string().optional(),
  smsConsent: z.boolean().optional(),
  // Marketing consent for WhatsApp. Distinct from smsConsent — that one is
  // operational messaging under 10DLC, this is Meta-policy marketing. Never
  // default one from the other.
  whatsappConsent: z.boolean().optional(),
  mediaAuthOptOuts: z.array(z.enum(["internal", "promotional", "public"])).optional(),
});

/**
 * Age in whole years as of today, computed entirely in UTC so the result is
 * stable regardless of server timezone. birthDate is "YYYY-MM-DD".
 */
function calculateAgeUTC(birthDate: string): number {
  const [year, month, day] = birthDate.split("-").map(Number);
  const now = new Date();
  let age = now.getUTCFullYear() - year;
  const hasHadBirthdayThisYear =
    now.getUTCMonth() + 1 > month ||
    (now.getUTCMonth() + 1 === month && now.getUTCDate() >= day);
  if (!hasHadBirthdayThisYear) age--;
  return age;
}

// POST - Post-payment registration completion: signs the waiver, backfills
// DOB/phone deferred by the v2 guest-checkout flow, flags age review, and
// fires the waiver_signed server event. Owner-scoped (not admin/tenant-
// scoped) — same idiom as the other /api/registrations/[id]/* endpoints.
export const POST: APIRoute = async ({ request, params, locals, clientAddress, url }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { id } = params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Registration ID required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (!z.string().uuid().safeParse(id).success) {
      return new Response(JSON.stringify({ error: "Invalid registration id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    const data = parsed.data;

    const db = getDb();

    // Ownership check: 404 (not 403) when the registration isn't owned by
    // this user — no cross-user probing signal. leftJoin on ageGroups since
    // a season may have no age group configured (no age-review check then).
    const [row] = await db
      .select({
        registration: registrations,
        familyMember: familyMembers,
        organizationId: locations.organizationId,
        ageGroup: ageGroups,
      })
      .from(registrations)
      .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
      .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .leftJoin(ageGroups, eq(seasons.ageGroupId, ageGroups.id))
      .where(
        and(
          eq(registrations.id, id),
          eq(registrations.registeredByUserId, user.id),
        ),
      );

    if (!row) {
      return new Response(JSON.stringify({ error: "Registration not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { registration, familyMember, organizationId, ageGroup } = row;

    // Idempotent: already-signed registrations short-circuit before any
    // consent/DOB/phone writes — no duplicate consent rows on a repeat call.
    if (registration.waiverSigned) {
      return new Response(JSON.stringify({ alreadySigned: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    const personKind = familyMember.selfUserId ? "self" : "dependent";

    // Never overwrite a v1-collected DOB — only fill it in when currently
    // null. The already-stored value (if any) is authoritative for the age
    // check; otherwise fall back to what was just provided.
    const effectiveDob = familyMember.birthDate ?? data.birthDate ?? null;

    const dobWrites: Promise<unknown>[] = [];
    if (data.birthDate) {
      dobWrites.push(
        db
          .update(familyMembers)
          .set({ birthDate: data.birthDate, updatedAt: new Date() })
          .where(
            and(
              eq(familyMembers.id, familyMember.id),
              isNull(familyMembers.birthDate),
            ),
          ),
      );
      if (familyMember.selfUserId) {
        dobWrites.push(
          db
            .update(users)
            .set({ birthDate: data.birthDate })
            .where(
              and(
                eq(users.id, familyMember.selfUserId),
                isNull(users.birthDate),
              ),
            ),
        );
      }
    }
    if (dobWrites.length > 0) {
      await Promise.all(dobWrites);
    }

    let ageReviewNeeded = false;
    if (ageGroup && effectiveDob) {
      const age = calculateAgeUTC(effectiveDob);
      if (age < ageGroup.minAge || age > ageGroup.maxAge) {
        ageReviewNeeded = true;
      }
    }

    const userAgent = request.headers.get("user-agent");

    // Consent recording — copied from guest-checkout.ts's consent block
    // rather than paraphrased, so the semantics (personal-consent guard,
    // unconditional liability + media-auth writes) stay identical.
    //
    // Consent writes and the waiver-signed UPDATE below are wrapped in a
    // single transaction: if the final UPDATE fails after consents commit
    // (a Railway blip is a known real failure mode), waiverSigned would
    // stay false while a retry re-inserts liability + media-auth consent
    // rows unguarded (only the personal-consent type has a hasActiveConsent
    // check). Sequential awaits only inside the tx — never Promise.all on a
    // tx handle (known incident).
    await db.transaction(async (tx) => {
      const baseConsent = {
        db: tx,
        familyMemberId: familyMember.id,
        registrationId: registration.id,
        organizationId,
        signedByUserId: user.id,
        signedByName: data.waiverSignature,
        ipAddress: clientAddress ?? null,
        userAgent: userAgent ?? null,
      };
      const personalConsentType =
        personKind === "self" ? "age_confirmation" : "parental";
      const needsPersonalConsent = !(await hasActiveConsent(
        tx,
        familyMember.id,
        personalConsentType,
      ));
      if (needsPersonalConsent) {
        await recordConsent({ ...baseConsent, type: personalConsentType });
      }
      await recordConsent({ ...baseConsent, type: "liability" });
      await recordDefaultMediaAuth({
        ...baseConsent,
        optOutScopes: data.mediaAuthOptOuts ?? [],
      });

      await tx
        .update(registrations)
        .set({
          waiverSigned: true,
          waiverSignedAt: new Date(),
          waiverSignedBy: data.waiverSignature,
          ageReviewNeeded,
          updatedAt: new Date(),
        })
        .where(eq(registrations.id, registration.id));
    });

    // Best-effort side effects, kept outside the transaction — not
    // consistency-critical with the waiver signature/consent state above.
    if (data.phone && organizationId) {
      try {
        await recordPhoneOptIn({
          db,
          organizationId,
          userId: user.id,
          phone: data.phone,
          consented: data.smsConsent ?? false,
          source: "registration_form",
        });
      } catch (err) {
        console.error("Failed to record phone opt-in:", err);
      }

      // WhatsApp marketing consent — its own phone_opt_ins row (channel
      // 'whatsapp'), written only on an affirmative tick. Unlike the SMS call
      // above there is no "record the absence" case: recordMarketingConsent is
      // documented as never-call-for-an-unticked-channel, and leaving the box
      // unchecked is not an opt-out of a consent given earlier.
      //
      // status defaults to "opted_in" because this endpoint is authenticated
      // (locals.user is required above), so the account being changed is
      // provably the customer's — no OTP promotion step needed.
      if (data.whatsappConsent) {
        try {
          await recordMarketingConsent({
            db,
            organizationId,
            userId: user.id,
            channel: "whatsapp",
            phone: data.phone,
            source: "registration_completion",
            // The literal sentence rendered by WhatsAppConsentCheckbox. Both
            // sides read this constant so the stored evidence and the live
            // form can never drift apart.
            textShown: CONSENT_COPY.whatsapp,
          });
        } catch (err) {
          console.error("Failed to record WhatsApp marketing consent:", err);
        }
      }
    }

    const via = url.searchParams.get("via") === "email_link" ? "email_link" : "confirm_screen";
    const daysAfterPayment = Math.floor(
      (Date.now() - registration.createdAt.getTime()) / 86_400_000,
    );

    const posthog = getPostHogServer();
    posthog.capture({
      distinctId: user.id,
      event: SERVER_EVENTS.waiverSigned,
      properties: {
        season_id: registration.seasonId,
        registration_id: registration.id,
        via,
        days_after_payment: daysAfterPayment,
        age_review_needed: ageReviewNeeded,
      },
    });

    return new Response(JSON.stringify({ signed: true, ageReviewNeeded }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error completing registration:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
