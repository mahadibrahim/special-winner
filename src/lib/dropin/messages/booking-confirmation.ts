import {
  dollars,
  escapeHtml,
  formatSessionTime,
  recipientName,
  sessionDetailLink,
  type BookingConfirmationContext,
  type MessageVariants,
} from "./types";

/**
 * Booking confirmation — fired immediately after a confirmed booking row
 * lands (online free path, online paid via Stripe webhook, and walk-up
 * via PaymentIntent webhook). Same renderer for all three sources; only
 * the `source` field changes wording slightly.
 */
export function renderBookingConfirmation(
  ctx: BookingConfirmationContext,
): MessageVariants {
  const startStr = formatSessionTime(ctx.session.startsAt, ctx.venue.timezone);
  const sportLabel = ctx.session.formatLabel
    ? `${ctx.session.sportOrClassLabel} (${ctx.session.formatLabel})`
    : ctx.session.sportOrClassLabel;
  const link = sessionDetailLink(ctx);
  const name = recipientName(ctx);
  const amountStr = ctx.booking.amountPaidCents > 0
    ? `Paid: ${dollars(ctx.booking.amountPaidCents)}.`
    : ctx.booking.paymentMethod === "card_present"
      ? `Paid at venue: ${dollars(ctx.booking.amountPaidCents)}.`
      : "Included with your membership.";
  const teamLine = ctx.booking.teamAssignment
    ? ` Team: ${ctx.booking.teamAssignment}.`
    : "";
  const sourceLabel = ctx.source === "walk_up" ? "Walk-up booking" : "Booking";
  const subject = `${sourceLabel} confirmed — ${sportLabel} at ${ctx.venue.name}`;

  const smsBody =
    `[Aspire] You're in for ${sportLabel} at ${ctx.venue.name} on ${startStr}.${teamLine} ${amountStr} Details: ${link}`;

  const html = `
    <h2>${escapeHtml(subject)}</h2>
    <p>Hi ${escapeHtml(name)},</p>
    <p>You're confirmed for <b>${escapeHtml(sportLabel)}</b> at <b>${escapeHtml(ctx.venue.name)}</b>.</p>
    <ul>
      <li><b>When:</b> ${escapeHtml(startStr)}</li>
      ${ctx.booking.teamAssignment ? `<li><b>Team:</b> ${escapeHtml(ctx.booking.teamAssignment)}</li>` : ""}
      <li><b>${escapeHtml(amountStr)}</b></li>
    </ul>
    <p><a href="${link}">View session details &rarr;</a></p>
    <p style="color:#666; font-size:13px;">Need to cancel? You can do it from your dashboard up to the cancellation window.</p>
  `.trim();

  const text = [
    subject,
    "",
    `Hi ${name},`,
    `You're confirmed for ${sportLabel} at ${ctx.venue.name}.`,
    `When: ${startStr}`,
    ctx.booking.teamAssignment ? `Team: ${ctx.booking.teamAssignment}` : null,
    amountStr,
    "",
    `Details: ${link}`,
  ]
    .filter(Boolean)
    .join("\n");

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
