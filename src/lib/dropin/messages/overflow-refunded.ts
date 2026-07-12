import {
  dollars,
  escapeHtml,
  formatSessionTime,
  recipientName,
  sessionDetailLink,
  type MessageVariants,
  type OverflowRefundedContext,
} from "./types";
import { renderEmail } from "@/lib/email/render";
import { DropInOverflowRefundedEmail } from "@/lib/email/templates/dropin-overflow-refunded";

/**
 * Transactional-capacity-gate overflow notice — fired when
 * handle-dropin-checkout-complete.ts finds the session full at the moment
 * payment settles (the last-spot race). The booking is waitlisted at the
 * FRONT of the line (priority 100) and the charge is auto-refunded in
 * full; this message tells the customer both facts honestly, in that
 * order — "you didn't get confirmed" before "but you're first and whole".
 *
 * The email channel renders the shared branded transactional template;
 * SMS and Telegram stay plain-text.
 */
export async function renderOverflowRefunded(
  ctx: OverflowRefundedContext,
): Promise<MessageVariants> {
  const startStr = formatSessionTime(ctx.session.startsAt, ctx.venue.timezone);
  const sportLabel = ctx.session.formatLabel
    ? `${ctx.session.sportOrClassLabel} (${ctx.session.formatLabel})`
    : ctx.session.sportOrClassLabel;
  const link = sessionDetailLink(ctx);
  const name = recipientName(ctx);
  const refundAmountLabel = dollars(ctx.booking.amountPaidCents);

  const subject = `${sportLabel} filled up as you paid — you're first in line`;

  const smsBody =
    `[Aspire] ${sportLabel} at ${ctx.venue.name} on ${startStr} filled up as you paid. ` +
    `You're first in line and ${refundAmountLabel} is being refunded. ` +
    `We'll text you the moment a spot opens: ${link}`;

  const { html, text } = await renderEmail(
    DropInOverflowRefundedEmail({
      recipientName: name,
      sportLabel,
      venueName: ctx.venue.name,
      whenLabel: startStr,
      refundAmountLabel,
      sessionUrl: link,
      brand: ctx.brand,
    }),
  );

  const tg =
    `<b>${escapeHtml(subject)}</b>\n` +
    `${escapeHtml(sportLabel)} at ${escapeHtml(ctx.venue.name)} on ${escapeHtml(startStr)} filled up as you paid.\n` +
    `You're first in line and ${escapeHtml(refundAmountLabel)} is being refunded.\n` +
    `<a href="${link}">View session →</a>`;

  return {
    sms: { body: smsBody },
    email: { subject, html, text },
    telegram: { body: tg, parse_mode: "HTML" },
  };
}
