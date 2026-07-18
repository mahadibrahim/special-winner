/**
 * Renders the request-lifecycle notifications (received / approved /
 * declined) sent to the renter as their field-rental request moves through
 * review. Structure mirrors rental-confirmation.ts — same brand/timezone
 * handling, same MessageVariants shape — but covers the pre-payment states
 * the request flow (Task 2) adds on top of the direct-booking flow.
 */
import { renderEmail } from "@/lib/email/render";
import { FieldRentalRequestEmail } from "@/lib/email/templates/field-rental-request";
import { normalizeBrand } from "@/lib/organization/soccerone-routing";
import { dollars } from "@/lib/dropin/messages/types";
import { formatRentalWindow } from "./format";
import type { BrandId } from "@/lib/branding/themes";
import type { RentalMessageVariants } from "./rental-confirmation";

export type RentalRequestKind = "received" | "approved" | "declined";

export interface RentalRequestMessageContext {
  recipientName: string;
  venueName: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string | null;
  amountDueCents: number;
  /** Self-serve pay link; only rendered/used for "approved". */
  payUrl: string | null;
  brand?: BrandId;
}

export async function renderRentalRequestMessage(
  kind: RentalRequestKind,
  ctx: RentalRequestMessageContext,
): Promise<RentalMessageVariants> {
  const brand = normalizeBrand(ctx.brand);
  const brandLabel = brand === "soccerone" ? "SoccerOne" : "Aspire";
  const whenLabel = formatRentalWindow(ctx.startsAt, ctx.endsAt, ctx.timezone);
  const amountLabel = ctx.amountDueCents > 0 ? dollars(ctx.amountDueCents) : null;

  const subject =
    kind === "received"
      ? `Request received — ${ctx.venueName} on ${whenLabel}`
      : kind === "approved"
        ? `Approved — reserve ${ctx.venueName} on ${whenLabel}`
        : `Update on your request — ${ctx.venueName}`;

  const { html, text } = await renderEmail(
    FieldRentalRequestEmail({
      recipientName: ctx.recipientName,
      venueName: ctx.venueName,
      whenLabel,
      kind,
      amountLabel,
      payUrl: ctx.payUrl,
      brand,
    }),
  );

  const sms =
    kind === "received"
      ? `[${brandLabel}] Got your request: ${ctx.venueName}, ${whenLabel}. We'll email a pay link once it's approved.`
      : kind === "approved"
        ? `[${brandLabel}] Approved: ${ctx.venueName}, ${whenLabel}. Pay within 24h to lock it in${ctx.payUrl ? `: ${ctx.payUrl}` : ""}.`
        : `[${brandLabel}] We couldn't fit your request: ${ctx.venueName}, ${whenLabel}. Try another time.`;

  return { email: { subject, html, text }, sms: { body: sms } };
}
