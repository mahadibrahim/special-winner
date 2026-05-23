import {
  dollars,
  escapeHtml,
  formatSessionTime,
  recipientName,
  sessionDetailLink,
  type BookingConfirmationContext,
  type MessageVariants,
} from "./types";
import { renderEmail } from "@/lib/email/render";
import { DropInBookingConfirmationEmail } from "@/lib/email/templates/dropin-booking-confirmation";

/**
 * Booking confirmation — fired immediately after a confirmed booking row
 * lands (online free path, online paid via Stripe webhook, kiosk walk-in,
 * and admin walk-up via PaymentIntent webhook). Same renderer for all
 * sources; only the `source` field changes wording slightly.
 *
 * The email channel renders the shared branded transactional template so it
 * matches every other Aspire email; SMS and Telegram stay plain-text.
 */
export async function renderBookingConfirmation(
  ctx: BookingConfirmationContext,
): Promise<MessageVariants> {
  const startStr = formatSessionTime(ctx.session.startsAt, ctx.venue.timezone);
  const sportLabel = ctx.session.formatLabel
    ? `${ctx.session.sportOrClassLabel} (${ctx.session.formatLabel})`
    : ctx.session.sportOrClassLabel;
  const link = sessionDetailLink(ctx);
  const name = recipientName(ctx);
  // Plain-text payment line for SMS / Telegram.
  const amountStr = ctx.booking.amountPaidCents > 0
    ? `Paid: ${dollars(ctx.booking.amountPaidCents)}.`
    : ctx.booking.paymentMethod === "card_present"
      ? `Paid at venue: ${dollars(ctx.booking.amountPaidCents)}.`
      : "Included with your membership.";
  // Label/value form for the email's detail panel.
  const amountLabel = ctx.booking.amountPaidCents > 0
    ? `${dollars(ctx.booking.amountPaidCents)} paid`
    : "Included with membership";
  const teamLine = ctx.booking.teamAssignment
    ? ` Team: ${ctx.booking.teamAssignment}.`
    : "";
  const sourceLabel = ctx.source === "walk_up" ? "Walk-up booking" : "Booking";
  const subject = `${sourceLabel} confirmed — ${sportLabel} at ${ctx.venue.name}`;

  const smsBody =
    `[Aspire] You're in for ${sportLabel} at ${ctx.venue.name} on ${startStr}.${teamLine} ${amountStr} Details: ${link}`;

  const { html, text } = await renderEmail(
    DropInBookingConfirmationEmail({
      recipientName: name,
      sportLabel,
      venueName: ctx.venue.name,
      whenLabel: startStr,
      teamAssignment: ctx.booking.teamAssignment,
      amountLabel,
      sessionUrl: link,
    }),
  );

  const tg =
    `<b>${escapeHtml(subject)}</b>\n` +
    `When: ${escapeHtml(startStr)}\n` +
    (ctx.booking.teamAssignment
      ? `Team: ${escapeHtml(ctx.booking.teamAssignment)}\n`
      : "") +
    `${escapeHtml(amountStr)}\n` +
    `<a href="${link}">View session →</a>`;

  return {
    sms: { body: smsBody },
    email: { subject, html, text },
    telegram: { body: tg, parse_mode: "HTML" },
  };
}
