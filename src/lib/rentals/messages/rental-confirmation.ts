/**
 * Field-rental confirmation renderer.
 *
 * Produces the email (branded HTML + plain text) and SMS variants for a
 * confirmed field rental. Mirrors the drop-in booking-confirmation renderer,
 * but rentals carry their own contact fields (renter_name/email/phone) and a
 * field number rather than a session/team, so this is a separate, simpler
 * renderer (no team assignment, no public session-detail link).
 */
import { renderEmail } from "@/lib/email/render";
import { FieldRentalConfirmationEmail } from "@/lib/email/templates/field-rental-confirmation";
import { normalizeBrand } from "@/lib/organization/soccerone-routing";
import { dollars } from "@/lib/dropin/messages/types";
import { formatRentalWindow } from "./format";
import type { BrandId } from "@/lib/branding/themes";

export interface RentalConfirmationContext {
  recipientName: string;
  venueName: string;
  fieldNumber: number;
  startsAt: Date;
  endsAt: Date;
  timezone: string | null;
  amountPaidCents: number;
  brand?: BrandId;
}

export interface RentalMessageVariants {
  email: { subject: string; html: string; text: string };
  sms: { body: string };
}

export { formatRentalWindow };

export async function renderRentalConfirmation(
  ctx: RentalConfirmationContext,
): Promise<RentalMessageVariants> {
  const brand = normalizeBrand(ctx.brand);
  const brandLabel = brand === "soccerone" ? "SoccerOne" : "Aspire";
  const fieldLabel = `Field ${ctx.fieldNumber}`;
  const whenLabel = formatRentalWindow(ctx.startsAt, ctx.endsAt, ctx.timezone);
  const amountLabel =
    ctx.amountPaidCents > 0 ? `${dollars(ctx.amountPaidCents)} paid` : null;

  const subject = `Rental confirmed — ${ctx.venueName} on ${whenLabel}`;

  const { html, text } = await renderEmail(
    FieldRentalConfirmationEmail({
      recipientName: ctx.recipientName,
      venueName: ctx.venueName,
      whenLabel,
      amountLabel,
      brand,
    }),
  );

  const paidStr = amountLabel ? ` ${dollars(ctx.amountPaidCents)} paid.` : "";
  const smsBody =
    `[${brandLabel}] Your rental is confirmed: ${fieldLabel} at ${ctx.venueName}, ${whenLabel}.${paidStr} See you there!`;

  return {
    email: { subject, html, text },
    sms: { body: smsBody },
  };
}
