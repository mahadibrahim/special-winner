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

  void sendOpsPing(row.organizationId, {
    kind: "rental_confirmed",
    brand,
    eventId: row.id,
    label: `${row.renterName} · field rental`,
    amountCents: row.amountPaidCents,
  });

  const variants = await renderRentalConfirmation({
    recipientName: row.renterName,
    venueName: row.venueName ?? "the facility",
    fieldNumber: row.fieldNumber,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    timezone: row.orgTimezone ?? null,
    amountPaidCents: row.amountPaidCents,
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
