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
import {
  WAIVER_ON_FILE_ATTRIBUTION,
  hasValidLiabilityWaiver,
  recordLiabilityWaiver,
} from "@/lib/consents/liability";
import { completionWaiverAssentText } from "@/lib/registrations/waiver-text";
import { recordPhoneOptIn } from "@/lib/sms/opt-in";
import { normalizeUsPhone } from "@/lib/sms/send";
import { recordMarketingConsent } from "@/lib/consents/marketing";
import { CONSENT_COPY } from "@/lib/consents/marketing-channels";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import { getPostHogServer } from "@/lib/posthog-server";
import { SERVER_EVENTS } from "@/lib/analytics/events";

const bodySchema = z.object({
  // Optional at the schema layer, REQUIRED on the fresh-signature branch (the
  // handler 400s there when either is missing). A participant already covered
  // by their annual waiver is shown no waiver text and no signature box — the
  // form submits only the items still outstanding, typically just the DOB —
  // and a schema that demanded a signature would force that client to invent
  // one, putting a fabricated name into a request about a legal release.
  waiverAccepted: z.literal(true).optional(),
  waiverSignature: z.string().min(2).optional(),
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

/**
 * `hasValidLiabilityWaiver`, failing towards RECORDING the signature the user
 * just typed. A lookup blip must not silently swallow a real signature — one
 * redundant consents row is the far cheaper wrong answer than a legal release
 * that was given and never written down.
 */
async function hasWaiverOnFile(
  familyMemberId: string,
  organizationId: string,
): Promise<boolean> {
  try {
    return await hasValidLiabilityWaiver(familyMemberId, organizationId);
  } catch (err) {
    console.error("[registration-complete] waiver validity lookup failed", err);
    return false;
  }
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

    // The name a human typed on THIS request, or null when the submission
    // carried no signature at all. The schema makes both fields optional so a
    // covered participant can submit a DOB-only completion — so their presence,
    // not the customer's coverage, is what tells a signing event apart from a
    // bare form submission. Kept as `string | null` rather than a boolean so
    // the branch chain below narrows it to a plain `string` for the
    // fresh-signature branch.
    const suppliedSignature: string | null =
      data.waiverAccepted && data.waiverSignature ? data.waiverSignature : null;

    // Which of the three branches below ran. Drives the response shape and
    // suppresses the waiver_signed event for the two that took no signature.
    let alreadySigned = false;

    if (registration.waiverSigned && registration.waiverSignedAt !== null) {
      // Idempotent: a row that already carries a real, DATED signature of its
      // own writes no consents on a repeat call.
      //
      // The date is load-bearing, not decoration. `waiverSigned` alone is also
      // true for a row born with the undated "On file (annual waiver)" stamp
      // (createRegistration's covered branch), where NOBODY signed this
      // registration — and treating that as a prior signature swallowed any
      // real signature that arrived afterwards. Such a row falls through: with
      // no signature to the on-file branch below (which re-stamps it
      // identically), and with one to the fresh-signature branch, which dates
      // it and appends the canonical consent. Clause 3 of
      // `recordLiabilityWaiver`'s caller contract; clause 4 names the date as
      // the replay discriminator.
      // The DOB backfill above still ran — it is isNull-guarded, so repeating
      // it is a no-op, and it is the one thing this endpoint collects that a
      // waiver-satisfied registration can still be missing (the v2 flow defers
      // DOB and the waiver together, and only one of the two is settled by an
      // annual signature).
      alreadySigned = true;
      // Backfill `completedAt` for a registration whose dated signature
      // landed some other way (or before this column existed) — this really
      // is the first time THIS ENDPOINT has completed it, and the phone/
      // marketing gate below needs that to be true regardless of how the
      // waiver itself got signed. Only ever fills a blank (registration.
      // completedAt is the PRE-REQUEST value); a registration this endpoint
      // already completed keeps its original timestamp.
      if (ageReviewNeeded && !registration.ageReviewNeeded) {
        await db
          .update(registrations)
          .set({
            ageReviewNeeded: true,
            updatedAt: new Date(),
            ...(registration.completedAt === null ? { completedAt: new Date() } : {}),
          })
          .where(eq(registrations.id, registration.id));
      } else if (registration.completedAt === null) {
        await db
          .update(registrations)
          .set({ completedAt: new Date(), updatedAt: new Date() })
          .where(eq(registrations.id, registration.id));
      }
    } else if (
      organizationId &&
      suppliedSignature === null &&
      (await hasWaiverOnFile(familyMember.id, organizationId))
    ) {
      // ANNUAL WAIVER, read side. `registrations.waiverSigned` is
      // per-REGISTRATION and so is false on every new row, even for a family
      // who signed a fortnight ago at another door of the same organization.
      // The platform rule is per person, per org, for a year — check that
      // before treating this submission as an ask.
      //
      // `suppliedSignature === null` is what makes this a READ, not a discard.
      // Coverage decides whether an ASK was needed; it never decides whether a
      // signature that DID arrive gets recorded (clause 3 of
      // `recordLiabilityWaiver`'s caller contract). A covered family that
      // still typed a name falls through to the fresh-signature branch below,
      // which dates the row and appends the canonical consent. Evaluated
      // before the predicate so the covered-and-signed case skips the lookup
      // entirely.
      //
      // `waiverSignedAt` is written as an EXPLICIT null: this row is a derived
      // copy of an earlier signature, not a signature, and
      // hasValidLiabilityWaiver's legacy `registrations` fallback accepts any
      // DATED signed row — dating it would let this registration renew the very
      // window it was derived from. Same rule as book-child.ts's on-file
      // branch and the drop-in door's WaiverCard endpoint.
      //
      // Nothing is appended to the LIABILITY log: that part is a READ.
      alreadySigned = true;
      await db.transaction(async (tx) => {
        // Media authorization is NOT a liability signature — it is the answer
        // to a consent control this screen puts in front of the customer, on
        // this branch exactly as on the fresh-signature one. Presenting the
        // photo/video opt-outs and then discarding them because the waiver
        // happened to be on file would silently ignore a choice they made.
        // In the tx with the stamp below so a failed stamp can't leave the
        // media rows orphaned and then be skipped by the replay branch on
        // retry (registration.waiverSigned would already read true).
        await recordDefaultMediaAuth({
          db: tx,
          familyMemberId: familyMember.id,
          registrationId: registration.id,
          organizationId,
          signedByUserId: user.id,
          // No signature was taken here, so the shared on-file attribution is
          // the honest signer — the same string the row is stamped with.
          signedByName: WAIVER_ON_FILE_ATTRIBUTION,
          ipAddress: clientAddress ?? null,
          userAgent: userAgent ?? null,
          optOutScopes: data.mediaAuthOptOuts ?? [],
        });

        await tx
          .update(registrations)
          .set({
            waiverSigned: true,
            waiverSignedBy: WAIVER_ON_FILE_ATTRIBUTION,
            waiverSignedAt: null,
            ageReviewNeeded,
            updatedAt: new Date(),
            // FIRST completion marker — see the file-level discriminator
            // comment below. This branch (unlike the dated-signature one)
            // does NOT date the row, so it can re-fire on a REPLAY of an
            // already on-file-completed registration; preserving the
            // original value (never overwriting with a later `new Date()`)
            // keeps `completedAt` an honest first-completion timestamp AND
            // keeps the phone/marketing gate correctly closed on that replay
            // (it reads the PRE-REQUEST value captured before this branch
            // ran).
            completedAt: registration.completedAt ?? new Date(),
          })
          .where(eq(registrations.id, registration.id));
      });
    } else if (suppliedSignature === null) {
      // A signature is genuinely owed here and none was supplied — the row is
      // unsigned and (per the branch above) nothing covers this participant.
      // The schema lets the fields through so a covered participant can submit
      // a DOB-only completion; this is where they become mandatory again.
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: {
            waiverSignature: ["A signature is required to sign this waiver"],
          },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    } else {
      const waiverSignature = suppliedSignature;
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
          signedByName: waiverSignature,
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
        // ANNUAL WAIVER, write side — the canonical org-scoped consents row,
        // in THIS tx so it lands with the signature it records. Only reached
        // on a genuinely fresh signature (the two branches above returned).
        // The org-less case (a season whose location carries no organization)
        // cannot go through the org-scoped helper and keeps the legacy write.
        if (organizationId) {
          await recordLiabilityWaiver(
            {
              familyMemberId: familyMember.id,
              organizationId,
              registrationId: registration.id,
              signedByUserId: user.id,
              signedByName: waiverSignature,
              consentVariant: personKind === "self" ? "adult" : "guardian",
              // The exact words completion-form.tsx put on screen: the accept
              // label, plus the guardian attestation for a dependent. Both
              // surfaces that mount that form pass the same participant name
              // this rebuilds (the confirm step and /account/complete).
              consentText: completionWaiverAssentText(
                personKind === "self" ? "adult" : "guardian",
                `${familyMember.firstName} ${familyMember.lastName}`.trim(),
              ),
              // The signing audit trail from THIS request — never the body.
              ipAddress: clientAddress ?? null,
              userAgent: userAgent ?? null,
            },
            tx,
          );
        } else {
          await recordConsent({ ...baseConsent, type: "liability" });
        }
        await recordDefaultMediaAuth({
          ...baseConsent,
          optOutScopes: data.mediaAuthOptOuts ?? [],
        });

        await tx
          .update(registrations)
          .set({
            waiverSigned: true,
            waiverSignedAt: new Date(),
            waiverSignedBy: waiverSignature,
            ageReviewNeeded,
            updatedAt: new Date(),
            // FIRST completion marker (see the on-file branch's identical
            // comment above) — a covered family that signs anyway can reach
            // this branch on a call AFTER an earlier on-file completion
            // already set it; never overwrite with a later timestamp.
            completedAt: registration.completedAt ?? new Date(),
          })
          .where(eq(registrations.id, registration.id));
      });
    }

    // Best-effort side effects, kept outside the transaction — not
    // consistency-critical with the waiver signature/consent state above.
    //
    // FIRST COMPLETION ONLY, and the discriminator is `registrations.
    // completedAt`, read PRE-REQUEST (before any branch ran) — a durable
    // marker set the first time THIS ENDPOINT completes a registration (see
    // every branch above), and ONLY by this endpoint. That is what makes it
    // narrow enough; three weaker gates were tried and rejected in order:
    //
    //  - Gating on nothing is load-bearing to reject first: before this
    //    endpoint was restructured the already-signed check returned early
    //    and this block was unreachable on a repeat POST. Leaving it
    //    reachable let a replayed submission re-run `recordMarketingConsent`,
    //    which promotes a channel to opted_in — i.e. a repeat call could
    //    silently CLEAR an opt-out the customer set afterwards.
    //  - Gating on `alreadySigned` was too wide: a covered family's FIRST
    //    completion takes the on-file branch, and that form still renders
    //    and posts the phone + consent boxes. This endpoint is the only
    //    capture point for authed-flow phone opt-ins and for ALL WhatsApp
    //    marketing consent, so skipping it there dropped the customer's
    //    answer on the floor.
    //  - Gating on the DATED bare flag (`waiverSigned && waiverSignedAt !==
    //    null`) was ALSO too wide, for a subtler reason a review caught: the
    //    on-file branch above does NOT date the row, so it can re-fire on a
    //    REPLAY of an already on-file-completed registration (nothing about
    //    that branch's own condition rules out running twice) — and each
    //    re-fire read as a "first completion" under the dated-flag gate,
    //    re-entering this block and re-promoting whatever channel state
    //    existed, INCLUDING an opt-out/STOP the customer set in between. A
    //    replayed completion resurrecting a carrier STOP is exactly the
    //    outcome the very first bullet above exists to prevent.
    //
    // `completedAt` closes that gap because it is written ONCE, by THIS
    // endpoint, on the branch's own first pass (every branch above sets it
    // only when it was previously null) — a second pass through ANY branch,
    // including a replayed on-file completion, reads it as already set and
    // skips this block entirely. (The DOB backfill above is deliberately NOT
    // gated at all: it is isNull-guarded, so it can only ever fill a blank.)
    if (registration.completedAt === null && data.phone && organizationId) {
      // DEFENSE IN DEPTH, scoped to this endpoint only (never a global change
      // to `recordPhoneOptIn`/`recordMarketingConsent` — see the open
      // question this leaves for the issue tracker below). Even with
      // `completedAt` closing the replay gap above, a web checkbox must
      // never be the thing that resurrects a carrier-level STOP: 10DLC/Meta
      // posture is that the only valid path back from STOP is the customer
      // texting START, not re-ticking a form box. Look up any EXISTING
      // opt-in row for this (org, phone) before writing anything, and skip
      // a channel outright when its row is `opted_out` with
      // `stopKeywordTriggered` set — a real carrier STOP, as opposed to some
      // other opted_out path that never had one.
      //
      // Fails CLOSED: a lookup failure here is treated as "assume both
      // channels are STOPped" and skips the writes below rather than risking
      // the resurrection this guard exists to prevent. A missed courtesy
      // opt-in on a blip is far cheaper than a compliance incident.
      const normalizedPhone = normalizeUsPhone(data.phone);
      let stoppedChannels: Set<string>;
      if (!normalizedPhone) {
        stoppedChannels = new Set();
      } else {
        try {
          const existingRows = await db
            .select({
              channel: phoneOptIns.channel,
              status: phoneOptIns.status,
              stopKeywordTriggered: phoneOptIns.stopKeywordTriggered,
            })
            .from(phoneOptIns)
            .where(
              and(
                eq(phoneOptIns.organizationId, organizationId),
                eq(phoneOptIns.phone, normalizedPhone),
              ),
            );
          stoppedChannels = new Set(
            existingRows
              .filter((r) => r.status === "opted_out" && r.stopKeywordTriggered !== null)
              .map((r) => r.channel),
          );
        } catch (err) {
          console.error("[registration-complete] STOP-guard lookup failed:", err);
          stoppedChannels = new Set(["sms", "whatsapp"]);
        }
      }

      if (!stoppedChannels.has("sms")) {
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
      if (data.whatsappConsent && !stoppedChannels.has("whatsapp")) {
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

    // Only a real signature is a waiver_signed event. The already-signed and
    // waiver-on-file branches took none — firing here would inflate the
    // completion funnel with repeat submissions and with families the flow
    // never actually asked.
    if (!alreadySigned) {
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
    }

    return new Response(
      JSON.stringify(
        alreadySigned
          ? { alreadySigned: true, ageReviewNeeded }
          : { signed: true, ageReviewNeeded },
      ),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error completing registration:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
