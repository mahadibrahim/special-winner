/**
 * Field-rental notification dispatcher.
 *
 * Sends the customer a confirmation after a rental is confirmed (online
 * checkout or at-facility card-present walk-up). Unlike the drop-in dispatcher
 * — which resolves channels from a registered user's messaging preferences —
 * rentals carry their own contact fields (`renter_email` / `renter_phone`) and
 * may be booked by a guest with no user account. So we send straight to those
 * fields: email-preferred, SMS fallback (so a renter who gave both isn't
 * double-notified). `sendSms` enforces its own opt-in gate, so a guest who
 * never opted in simply gets no SMS.
 *
 * Brand is read from the `field_rentals.brand` column (persisted at booking
 * creation from the host header), so SoccerOne rentals send SoccerOne-branded
 * confirmations.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { venues } from "@/lib/db/schema/teams";
import { organizations } from "@/lib/db/schema/organizations";
import { sendEmail, isEmailConfigured, fromForBrand } from "@/lib/email";
import { sendSms, normalizeUsPhone } from "@/lib/sms/send";
import { normalizeBrand } from "@/lib/organization/soccerone-routing";
import { sendOpsPing } from "@/lib/ops/ping";
import { renderRentalConfirmation } from "./rental-confirmation";
import { renderRentalRequestMessage } from "./request-lifecycle";
import { formatRentalWindow } from "./format";
import { getAdminNotifyEmail } from "@/lib/organization/notify";
import { escapeHtml } from "@/lib/dropin/messages/types";
import { env } from "@/lib/env";
import { mintRentalClaimToken } from "@/lib/rentals/claim";

export interface RentalDispatchResult {
  ok: boolean;
  channel?: "email" | "sms";
  reason?: string;
  error?: string;
}

export async function dispatchRentalConfirmation(
  rentalId: string,
): Promise<RentalDispatchResult> {
  const db = getDb();
  const [row] = await db
    .select({
      id: fieldRentals.id,
      organizationId: fieldRentals.organizationId,
      fieldNumber: fieldRentals.fieldNumber,
      startsAt: fieldRentals.startsAt,
      endsAt: fieldRentals.endsAt,
      amountPaidCents: fieldRentals.amountPaidCents,
      renterName: fieldRentals.renterName,
      renterEmail: fieldRentals.renterEmail,
      renterPhone: fieldRentals.renterPhone,
      renterUserId: fieldRentals.renterUserId,
      brand: fieldRentals.brand,
      venueName: venues.name,
      orgTimezone: organizations.timezone,
    })
    .from(fieldRentals)
    .leftJoin(venues, eq(venues.id, fieldRentals.venueId))
    .leftJoin(organizations, eq(organizations.id, fieldRentals.organizationId))
    .where(eq(fieldRentals.id, rentalId))
    .limit(1);

  if (!row) return { ok: false, reason: "rental_not_found" };

  const hasEmail = Boolean(row.renterEmail);
  const hasPhone = Boolean(row.renterPhone);
  if (!hasEmail && !hasPhone) return { ok: false, reason: "no_contact_info" };

  const brand = normalizeBrand(row.brand);

  await sendOpsPing(row.organizationId, {
    kind: "rental_confirmed",
    brand,
    eventId: row.id,
    label: `${row.renterName} · field rental`,
    amountCents: row.amountPaidCents,
  });

  const manageUrl = await resolveManageUrl(row.id, row.renterUserId);

  const variants = await renderRentalConfirmation({
    recipientName: row.renterName,
    venueName: row.venueName ?? "the facility",
    fieldNumber: row.fieldNumber,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    timezone: row.orgTimezone ?? null,
    amountPaidCents: row.amountPaidCents,
    manageUrl,
    brand,
  });

  let lastReason: string | undefined;
  let lastError: string | undefined;

  if (hasEmail) {
    if (!isEmailConfigured()) {
      lastReason = "email_not_configured";
    } else {
      const r = await sendEmail({
        to: row.renterEmail!,
        subject: variants.email.subject,
        html: variants.email.html,
        text: variants.email.text,
        from: fromForBrand(brand),
      });
      if (r.success) return { ok: true, channel: "email" };
      lastReason = "email_failed";
      lastError = r.error;
    }
  }

  if (hasPhone) {
    const normalized = normalizeUsPhone(row.renterPhone!);
    if (!normalized) {
      lastReason = "invalid_phone";
    } else {
      const r = await sendSms({
        to: normalized,
        body: variants.sms.body,
        organizationId: row.organizationId,
      });
      if (r.ok) return { ok: true, channel: "sms" };
      lastReason = r.reason;
      lastError = r.error;
    }
  }

  return { ok: false, reason: lastReason ?? "no_channel_available", error: lastError };
}

const APP_URL = env.PUBLIC_APP_URL;

async function loadRentalForMessage(rentalId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      id: fieldRentals.id,
      organizationId: fieldRentals.organizationId,
      fieldNumber: fieldRentals.fieldNumber,
      startsAt: fieldRentals.startsAt,
      endsAt: fieldRentals.endsAt,
      amountDueCents: fieldRentals.amountDueCents,
      renterName: fieldRentals.renterName,
      renterEmail: fieldRentals.renterEmail,
      renterPhone: fieldRentals.renterPhone,
      renterUserId: fieldRentals.renterUserId,
      brand: fieldRentals.brand,
      venueName: venues.name,
      orgTimezone: organizations.timezone,
    })
    .from(fieldRentals)
    .leftJoin(venues, eq(venues.id, fieldRentals.venueId))
    .leftJoin(organizations, eq(organizations.id, fieldRentals.organizationId))
    .where(eq(fieldRentals.id, rentalId))
    .limit(1);
  return row ?? null;
}

/**
 * A signed-in renter's post-approval / post-confirmation link is the
 * dashboard; a guest (no `renterUserId`) has no dashboard yet, so mint a
 * claim link instead. Re-fetches the full rental row for the guest branch
 * since `mintRentalClaimToken` needs the full `FieldRental` shape and the
 * message-loading selects above only pick a subset of columns.
 */
async function resolveManageUrl(
  rentalId: string,
  renterUserId: string | null,
): Promise<string | null> {
  if (renterUserId) return `${APP_URL}/dashboard/bookings`;

  const db = getDb();
  const [rental] = await db
    .select()
    .from(fieldRentals)
    .where(eq(fieldRentals.id, rentalId))
    .limit(1);
  if (!rental) return null;

  const token = await mintRentalClaimToken(rental);
  return `${APP_URL}/rentals/claim/${token}`;
}

/**
 * Shared body for the three renter-facing request-lifecycle notifications.
 * Same email-preferred/SMS-fallback pattern as dispatchRentalConfirmation
 * above, just against the request-lifecycle renderer instead of the
 * confirmation renderer.
 */
async function dispatchRequestLifecycle(
  rentalId: string,
  kind: "received" | "approved" | "declined",
): Promise<RentalDispatchResult> {
  const row = await loadRentalForMessage(rentalId);
  if (!row) return { ok: false, reason: "rental_not_found" };

  const hasEmail = Boolean(row.renterEmail);
  const hasPhone = Boolean(row.renterPhone);
  if (!hasEmail && !hasPhone) return { ok: false, reason: "no_contact_info" };

  const brand = normalizeBrand(row.brand);
  const payUrl =
    kind === "approved" ? await resolveManageUrl(row.id, row.renterUserId) : null;
  const variants = await renderRentalRequestMessage(kind, {
    recipientName: row.renterName,
    venueName: row.venueName ?? "the facility",
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    timezone: row.orgTimezone ?? null,
    amountDueCents: row.amountDueCents,
    payUrl,
    brand,
  });

  let lastReason: string | undefined;
  let lastError: string | undefined;

  if (hasEmail) {
    if (!isEmailConfigured()) {
      lastReason = "email_not_configured";
    } else {
      const r = await sendEmail({
        to: row.renterEmail!,
        subject: variants.email.subject,
        html: variants.email.html,
        text: variants.email.text,
        from: fromForBrand(brand),
      });
      if (r.success) return { ok: true, channel: "email" };
      lastReason = "email_failed";
      lastError = r.error;
    }
  }

  if (hasPhone) {
    const normalized = normalizeUsPhone(row.renterPhone!);
    if (!normalized) {
      lastReason = "invalid_phone";
    } else {
      const r = await sendSms({
        to: normalized,
        body: variants.sms.body,
        organizationId: row.organizationId,
      });
      if (r.ok) return { ok: true, channel: "sms" };
      lastReason = r.reason;
      lastError = r.error;
    }
  }

  return { ok: false, reason: lastReason ?? "no_channel_available", error: lastError };
}

/** Sent to the renter as soon as `createRentalRequest` commits. */
export const dispatchRentalRequestReceived = (rentalId: string) =>
  dispatchRequestLifecycle(rentalId, "received");

/** Sent to the renter once an admin approves the request. */
export const dispatchRentalRequestApproved = (rentalId: string) =>
  dispatchRequestLifecycle(rentalId, "approved");

/** Sent to the renter if an admin declines the request. */
export const dispatchRentalRequestDeclined = (rentalId: string) =>
  dispatchRequestLifecycle(rentalId, "declined");

/**
 * Notify the org that a new rental request needs review. Unlike sendOpsPing
 * (opt-in per org, rate-limited, WhatsApp-first — meant for FYI-style
 * activity pings), a new request blocks on an admin actually seeing it to
 * approve/decline, so this sends a direct email via getAdminNotifyEmail
 * rather than routing through the ops-ping channel.
 */
export async function dispatchNewRentalRequestToAdmin(
  rentalId: string,
): Promise<RentalDispatchResult> {
  const row = await loadRentalForMessage(rentalId);
  if (!row) return { ok: false, reason: "rental_not_found" };

  const to = await getAdminNotifyEmail(row.organizationId);
  if (!to) return { ok: false, reason: "no_admin_email" };
  if (!isEmailConfigured()) return { ok: false, reason: "email_not_configured" };

  const brand = normalizeBrand(row.brand);
  const whenLabel = formatRentalWindow(row.startsAt, row.endsAt, row.orgTimezone ?? null);
  const venueName = row.venueName ?? "a field";
  const reviewUrl = `${APP_URL}/admin/rentals/${row.id}`;

  const r = await sendEmail({
    to,
    subject: `New field-rental request — ${venueName}`,
    html: `<p>${escapeHtml(row.renterName)} requested ${escapeHtml(venueName)} (Field ${row.fieldNumber}), ${escapeHtml(whenLabel)}.</p><p><a href="${reviewUrl}">Review the request</a></p>`,
    text: `${row.renterName} requested ${venueName} (Field ${row.fieldNumber}), ${whenLabel}. Review: ${reviewUrl}`,
    from: fromForBrand(brand),
  });

  return r.success
    ? { ok: true, channel: "email" }
    : { ok: false, reason: "email_failed", error: r.error };
}
