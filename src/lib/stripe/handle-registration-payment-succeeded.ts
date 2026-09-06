import type Stripe from "stripe";
import { eq, asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  registrations,
  payments,
  seasons,
  programs,
  locations,
  familyMembers,
  users,
  sports,
  teamInvitees,
} from "@/lib/db/schema";
import {
  sendRegistrationConfirmationEmail,
  sendMagicLinkLoginEmail,
  sendPaymentReceiptEmail,
} from "@/lib/email/send";
import { awaitEmailSend } from "@/lib/notifications/await-dispatch";
import { createMagicLink, buildMagicLinkUrl } from "@/lib/auth/magic-link";
import { normalizeBrand, originForBrand } from "@/lib/organization/soccerone-routing";
import { fireServerPurchaseConversions } from "@/lib/analytics/server-conversions";
import { capturePaymentCompleted } from "@/lib/observability/payment-telemetry";
import { sendOpsPing } from "@/lib/ops/ping";
import { teamRegistrationMembers, teamRegistrations, ageGroups } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { teamRosterCollectedCents } from "@/lib/registrations/team-funding";
import { maybeRefundTeamDeposit } from "@/lib/payments/team-deposit-refund";
import { isYouthTeamSeason } from "@/lib/registrations/team-season-kind";
import { logAlert } from "@/lib/logging/alerts";

// Handles `payment_intent.succeeded` for registration payments. Mirrors
// the prior Checkout-Session flow exactly, just sourced from a PI.
export async function handleRegistrationPaymentSucceeded(
  paymentIntent: Stripe.PaymentIntent,
): Promise<
  | { status: "skipped"; reason: string }
  | { status: "processed"; registrationId: string; paidCents: number }
> {
  const registrationId = paymentIntent.metadata?.registrationId;
  const paymentType = paymentIntent.metadata?.type;

  if (paymentType !== "registration_payment" || !registrationId) {
    return { status: "skipped", reason: "not a registration payment" };
  }

  const db = getDb();

  // Dedupe by stripePaymentIntentId — webhook router already uses a
  // stripe_events ledger; this is a defense-in-depth check against a
  // re-delivered event slipping past it.
  const existingPayment = await db
    .select({ id: payments.id })
    .from(payments)
    .where(eq(payments.stripePaymentIntentId, paymentIntent.id))
    .orderBy(asc(payments.createdAt))
    .limit(1);

  if (existingPayment.length > 0) {
    return {
      status: "skipped",
      reason: `duplicate delivery for payment intent ${paymentIntent.id}`,
    };
  }

  const [registration] = await db
    .select()
    .from(registrations)
    .where(eq(registrations.id, registrationId));

  if (!registration) {
    return { status: "skipped", reason: `registration ${registrationId} not found` };
  }

  // The card surcharge is added to the PaymentIntent total at checkout (see
  // createPaymentIntent), so amount_received = registration base + surcharge.
  // The surcharge is a pass-through processing fee, NOT part of the
  // registration price or org revenue. Credit only the base toward the
  // registration balance — crediting the gross inflates registration
  // .amountPaidCents, which corrupts the money trail, the SUM(amountCents)
  // revenue reports, and the admin-refund cap (it caps at amountPaidCents).
  // It would also over-credit a partial/balance payment toward amountDueCents.
  // The surcharge is preserved in the payment row metadata for reconciliation.
  const grossPaidCents = paymentIntent.amount_received || paymentIntent.amount || 0;
  const surchargeCents =
    Number.parseInt(paymentIntent.metadata?.surcharge_cents ?? "", 10) || 0;
  const amountPaid = Math.max(0, grossPaidCents - surchargeCents);
  const newAmountPaid = registration.amountPaidCents + amountPaid;
  const isFullyPaid = newAmountPaid >= registration.amountDueCents;
  const newAmountDue = Math.max(0, registration.amountDueCents - amountPaid);

  // latest_charge maps the PaymentIntent to its Charge — required so
  // charge.dispute.* events can find this payment row by stripeChargeId.
  const stripeChargeId =
    typeof paymentIntent.latest_charge === "string"
      ? paymentIntent.latest_charge
      : paymentIntent.latest_charge?.id ?? null;

  let paymentTypeValue: "deposit" | "balance" | "full";
  if (registration.amountPaidCents > 0) {
    paymentTypeValue = "balance";
  } else if (registration.registrationType === "deposit") {
    paymentTypeValue = "deposit";
  } else {
    paymentTypeValue = "full";
  }

  // The registration status update and the payment-ledger insert must land
  // together — a partial write (status flipped but no payment row, or vice
  // versa) corrupts the money trail. Wrap both in one transaction.
  await db.transaction(async (tx) => {
    await tx
      .update(registrations)
      .set({
        status: "confirmed",
        paymentStatus: isFullyPaid ? "paid" : "deposit_paid",
        amountPaidCents: newAmountPaid,
        amountDueCents: newAmountDue,
        updatedAt: new Date(),
      })
      .where(eq(registrations.id, registrationId));

    await tx.insert(payments).values({
      registrationId,
      userId: registration.registeredByUserId,
      amountCents: amountPaid,
      paymentType: paymentTypeValue as "deposit" | "full" | "balance" | "refund" | "installment",
      status: "succeeded",
      stripePaymentIntentId: paymentIntent.id,
      stripeChargeId,
      metadata: {
        customerEmail: paymentIntent.receipt_email,
        ...(surchargeCents > 0 ? { surchargeCents } : {}),
      },
    });
  });

  // If this registration is a teammate paying their captain-assigned share,
  // flip the invitee row to "paid" so the captain backstop no longer counts it
  // among the unpaid shares. Defensive: a missing/failed update must not affect
  // the (already-committed) registration fulfillment. Only mark paid once the
  // registration is fully settled.
  if (isFullyPaid) {
    try {
      await db
        .update(teamInvitees)
        .set({ status: "paid", paidAt: new Date() })
        .where(eq(teamInvitees.registrationId, registrationId));
    } catch (err) {
      console.error("[stripe webhook] team invitee paid-flip failed:", err);
    }
  }

  // Single team-membership lookup (review round 1, minor 4): this used to
  // be TWO separate registrationId -> team joins (one here, one further
  // down for the ops-ping team-name suffix) — consolidated into one query,
  // reused by both. Also gives it the explicit `orderBy` CLAUDE.md requires
  // for any query that picks "a" row via `.limit(1)` from a set of possible
  // matches: a shared CI DB can carry more than one `team_registration_members`
  // row for the same registrationId (no DB-level uniqueness constraint
  // enforces one team per registration), so an un-ordered `.limit(1)` would
  // pick an arbitrary one. Ordered oldest-membership-first
  // (`asc(teamRegistrationMembers.joinedAt)`), the safe default per
  // CLAUDE.md's multi-tenant query hazards section. Also carries the
  // season/age-group columns `isYouthTeamSeason` needs, so the
  // full-collection check below can skip adult teams without a second query
  // (minor 5 — adult teams shouldn't pay for the roster-collected check on
  // every share payment).
  let teamMembership:
    | {
        teamRegistrationId: string;
        teamName: string;
        teamFeeCents: number | null;
        seasonMinAge: number | null;
        ageGroupMinAge: number | null;
      }
    | undefined;
  try {
    [teamMembership] = await db
      .select({
        teamRegistrationId: teamRegistrationMembers.teamRegistrationId,
        teamName: teamRegistrations.teamName,
        teamFeeCents: teamRegistrations.teamFeeCents,
        seasonMinAge: seasons.minAge,
        ageGroupMinAge: ageGroups.minAge,
      })
      .from(teamRegistrationMembers)
      .innerJoin(
        teamRegistrations,
        eq(teamRegistrationMembers.teamRegistrationId, teamRegistrations.id),
      )
      .innerJoin(seasons, eq(teamRegistrations.seasonId, seasons.id))
      .leftJoin(ageGroups, eq(seasons.ageGroupId, ageGroups.id))
      .where(eq(teamRegistrationMembers.registrationId, registrationId))
      .orderBy(asc(teamRegistrationMembers.joinedAt))
      .limit(1);
  } catch (err) {
    console.error("[stripe webhook] team-membership lookup failed:", err);
    await logAlert("team_deposit_refund_failed", {
      registrationId,
      stripePaymentIntentId: paymentIntent.id,
      error: err instanceof Error ? err.message : String(err),
      phase: "full_collection_membership_lookup_threw",
    });
  }

  // Full-collection deposit refund trigger (winter-team-fixes, task 3): if
  // this registration belongs to a YOUTH team and the ROSTER (not this
  // payment alone) now covers the team fee in full, the captain's deposit
  // is no longer needed as a backstop — release it. Runs regardless of
  // `isFullyPaid` for THIS registration: a partial/installment payment can
  // still be the one that tips the roster's cumulative total over the fee,
  // so every team-linked payment re-checks. `teamRosterCollectedCents` is
  // used deliberately, NOT `teamMoneyReceivedCents`/`teamBackstopDueCents` —
  // the roster-collected figure excludes the deposit and its refund by
  // construction, which is what keeps this check from re-arming itself the
  // moment `maybeRefundTeamDeposit` issues the refund (see that helper's doc
  // comment in team-funding.ts). Gated on `isYouthTeamSeason` up front so an
  // adult team's payment never runs the roster-collected query at all — the
  // executor would just skip it as `adult_season` anyway, but there's no
  // reason to pay for that round-trip on every adult share payment. Best-
  // effort and isolated in its own try/catch: a refund-executor failure
  // must NEVER fail payment fulfillment — the executor already self-heals
  // via the cron's retry sweep, so an alert here is enough.
  if (teamMembership) {
    try {
      const isYouth = isYouthTeamSeason({
        minAge: teamMembership.seasonMinAge,
        ageGroupMinAge: teamMembership.ageGroupMinAge,
      });
      if (isYouth && teamMembership.teamFeeCents != null) {
        const rosterCollected = await teamRosterCollectedCents(
          db,
          teamMembership.teamRegistrationId,
        );
        if (rosterCollected.totalCents >= teamMembership.teamFeeCents) {
          await maybeRefundTeamDeposit(db, {
            teamId: teamMembership.teamRegistrationId,
            trigger: "full_collection",
          });
        }
      }
    } catch (err) {
      console.error(
        "[stripe webhook] team deposit full-collection check failed:",
        err,
      );
      await logAlert("team_deposit_refund_failed", {
        registrationId,
        teamRegistrationId: teamMembership.teamRegistrationId,
        stripePaymentIntentId: paymentIntent.id,
        error: err instanceof Error ? err.message : String(err),
        phase: "full_collection_caller_threw",
      });
    }
  }

  try {
    const [row] = await db
      .select({
        user: users,
        familyMember: familyMembers,
        season: seasons,
        program: programs,
        location: locations,
      })
      .from(registrations)
      .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
      .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(locations, eq(programs.locationId, locations.id))
      .innerJoin(users, eq(registrations.registeredByUserId, users.id))
      .where(eq(registrations.id, registrationId));

    if (row) {
      // These four sends are mutually independent (two emails, an ops ping,
      // Team context for the ops ping: a member paying through a team link is
      // a team event — name the team so the principals see the roster grow.
      // Reuses the single team-membership lookup from above (review round 1,
      // minor 4) instead of re-running the same join a second time.
      const teamJoinSuffix = teamMembership
        ? ` · joined ${teamMembership.teamName}`
        : "";

      // and — only for guest checkout — a magic-link mint + email) and were
      // previously awaited serially, roughly quadrupling this section's
      // contribution to webhook ACK latency. awaitEmailSend/awaitDispatch and
      // sendOpsPing already swallow their own failures (resolve, never
      // reject — see their doc comments), and the guest-checkout branch below
      // wraps createMagicLink + its send in its own try/catch, so none of
      // these promises can reject; Promise.all is safe, but allSettled is
      // used anyway as a belt-and-suspenders guard against a future change
      // to one of those wrappers silently starting to throw.
      const sends: Promise<unknown>[] = [
        awaitEmailSend("registration confirmation", async () => {
          // Waiver still unsigned (v2 solo checkout can complete payment
          // before the waiver step) — thread a completion CTA into the
          // email. Guest/passwordless parents need a magic-link so the
          // link signs them in transparently, same as the guest-checkout
          // login link below; authed-with-password parents get a plain
          // path (middleware gates /account, bouncing through /signin).
          let completionUrl: string | undefined;
          if (!registration.waiverSigned) {
            const destPath = `/account/complete/${registrationId}?via=email_link`;
            const brandAppUrl =
              originForBrand(normalizeBrand(paymentIntent.metadata?.brand)) ??
              env.PUBLIC_APP_URL;
            if (row.user.passwordHash === null) {
              const link = await createMagicLink({
                userId: registration.registeredByUserId,
                organizationId: row.location.organizationId ?? undefined,
                purpose: "login",
                purposeContext: { redirectTo: destPath },
                deliveredChannel: "email",
                deliveredTo: row.user.email,
              });
              completionUrl = buildMagicLinkUrl(link.token, { origin: brandAppUrl });
            } else {
              completionUrl = `${brandAppUrl}${destPath}`;
            }
          }

          return sendRegistrationConfirmationEmail({
            userId: row.user.id,
            organizationId: row.location.organizationId ?? undefined,
            registrationId,
            parentEmail: row.user.email,
            parentName: row.user.firstName || row.user.email.split("@")[0],
            childName: `${row.familyMember.firstName} ${row.familyMember.lastName}`,
            programName: row.program.name,
            seasonName: row.season.name,
            startDate: row.season.startDate,
            endDate: row.season.endDate,
            scheduleNotes: row.season.scheduleNotes || undefined,
            locationName: row.location.name,
            locationAddress:
              [row.location.addressLine1, row.location.city, row.location.state]
                .filter(Boolean)
                .join(", ") || undefined,
            amountDueCents: registration.amountDueCents,
            paymentStatus: isFullyPaid ? "paid" : "deposit_paid",
            registrationStatus: "confirmed",
            completionUrl,
            brand: normalizeBrand(paymentIntent.metadata?.brand),
          });
        }, { registrationId }),

        awaitEmailSend("payment receipt", () => sendPaymentReceiptEmail({
          userId: row.user.id,
          organizationId: row.location.organizationId ?? undefined,
          registrationId,
          parentEmail: row.user.email,
          parentName: row.user.firstName || row.user.email.split("@")[0],
          childName: `${row.familyMember.firstName} ${row.familyMember.lastName}`,
          programName: row.program.name,
          seasonName: row.season.name,
          amountPaidCents: amountPaid,
          paymentType: paymentTypeValue,
          remainingBalanceCents: isFullyPaid ? undefined : newAmountDue,
          receiptNumber: paymentIntent.id.replace(/^pi_(test_)?/, "").slice(0, 12),
          brand: normalizeBrand(paymentIntent.metadata?.brand),
        }), { registrationId }),

        sendOpsPing(row.location.organizationId, {
          kind: "registration_paid",
          brand: registration.brand,
          // Use the payment intent id, not registration.id: a registration can
          // receive multiple payments (deposit, then balance/installments) and
          // each one is a distinct payment event — keying on registration.id
          // would dedupe every payment after the first against the initial ping.
          eventId: paymentIntent.id,
          label: `${row.familyMember.firstName} ${row.familyMember.lastName} · ${row.program.name} ${row.season.name}${teamJoinSuffix}`,
          amountCents: amountPaid,
        }),
      ];

      if (paymentIntent.metadata?.via_guest_checkout === "true") {
        sends.push(
          (async () => {
            try {
              const link = await createMagicLink({
                userId: registration.registeredByUserId,
                organizationId: row.location.organizationId ?? undefined,
                purpose: "login",
                purposeContext: { redirectTo: `/dashboard?welcome=${registrationId}` },
                deliveredChannel: "email",
                deliveredTo: row.user.email,
              });
              await awaitEmailSend("guest magic-link login", () => sendMagicLinkLoginEmail({
                userId: row.user.id,
                organizationId: row.location.organizationId ?? undefined,
                parentEmail: row.user.email,
                parentName: row.user.firstName || row.user.email.split("@")[0],
                // No request context in a webhook — derive the redemption domain
                // from the charge's brand metadata so a gosoccerone.com purchase
                // signs the customer in on gosoccerone.com.
                magicLinkUrl: buildMagicLinkUrl(link.token, {
                  origin: originForBrand(paymentIntent.metadata?.brand),
                }),
                expiresIn: "15 minutes",
                programName: row.program.name,
                childName: `${row.familyMember.firstName} ${row.familyMember.lastName}`,
                seasonName: row.season.name,
                brand: normalizeBrand(paymentIntent.metadata?.brand),
              }), { registrationId });
            } catch (err) {
              console.error("[stripe webhook] magic-link mint failed:", err);
            }
          })(),
        );
      }

      await Promise.allSettled(sends);
    }
  } catch (err) {
    console.error("[stripe webhook] email payload build failed:", err);
  }

  // Server-side ad conversions (GA4 Measurement Protocol + Meta CAPI) — the
  // source of truth for Purchase counts; the browser pixel fire on
  // /payment/return is the attribution-signal twin, deduped against this one
  // by the shared PaymentIntent id. Fires for every online sale (hashed
  // email/phone/name are sufficient match keys — ad-click ids improve
  // attribution but aren't required), so it also covers payment methods the
  // browser pixel misses entirely. Item context needs a JOIN, so this runs
  // after the fulfillment transaction.
  const md = paymentIntent.metadata ?? {};
  const hasConversionSignal =
    md.ga_client_id ||
    md.fbclid ||
    md._fbc ||
    md._fbp ||
    paymentIntent.receipt_email;
  if (hasConversionSignal) {
    try {
      const [itemRow] = await db
        .select({
          seasonId: seasons.id,
          seasonName: seasons.name,
          programName: programs.name,
          sportName: sports.name,
          seasonPriceCents: seasons.priceCents,
          buyer: {
            id: users.id,
            email: users.email,
            phone: users.phone,
            firstName: users.firstName,
            lastName: users.lastName,
          },
        })
        .from(registrations)
        .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
        .innerJoin(programs, eq(seasons.programId, programs.id))
        .innerJoin(sports, eq(programs.sportId, sports.id))
        .innerJoin(users, eq(registrations.registeredByUserId, users.id))
        .where(eq(registrations.id, registrationId));

      if (itemRow) {
        let paymentTypeForTracking: "deposit" | "balance" | "full";
        if (registration.amountPaidCents > 0) {
          paymentTypeForTracking = "balance";
        } else if (registration.registrationType === "deposit") {
          paymentTypeForTracking = "deposit";
        } else {
          paymentTypeForTracking = "full";
        }

        const itemName = `${itemRow.programName} - ${itemRow.seasonName}`;
        fireServerPurchaseConversions({
          metadata: paymentIntent.metadata,
          eventId: paymentIntent.id,
          valueCents: amountPaid,
          brand: normalizeBrand(paymentIntent.metadata?.brand),
          email: paymentIntent.receipt_email ?? itemRow.buyer.email,
          phone: itemRow.buyer.phone,
          firstName: itemRow.buyer.firstName,
          lastName: itemRow.buyer.lastName,
          userId: itemRow.buyer.id,
          ga4Items: [
            {
              id: itemRow.seasonId,
              name: itemName,
              category: itemRow.sportName,
              priceCents: itemRow.seasonPriceCents,
            },
          ],
          ga4PaymentType: paymentTypeForTracking,
          ga4Coupon: paymentIntent.metadata?.discount_code,
          contentIds: [itemRow.seasonId],
          contentName: itemName,
          contentCategory: "registration",
        });
      }
    } catch (err) {
      console.error("[stripe webhook] purchase-conversion item JOIN failed:", err);
    }
  }

  capturePaymentCompleted({
    distinctId: registration.registeredByUserId,
    clientDistinctId: paymentIntent.metadata?.ph_distinct_id,
    sessionId: paymentIntent.metadata?.ph_session_id,
    kind: "registration",
    amountCents: amountPaid,
    brand: normalizeBrand(paymentIntent.metadata?.brand),
    metadata: {
      registration_id: registrationId,
      payment_type: paymentTypeValue,
      fully_paid: isFullyPaid,
      via_guest_checkout: paymentIntent.metadata?.via_guest_checkout === "true",
    },
  });

  return { status: "processed", registrationId, paidCents: amountPaid };
}
