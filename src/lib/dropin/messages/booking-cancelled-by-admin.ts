import {
  dollars,
  escapeHtml,
  formatSessionTime,
  recipientName,
  sessionDetailLink,
  type BookingCancelledByAdminContext,
  type MessageVariants,
} from "./types";

/**
 * Admin-cancelled / admin-refunded booking notice.
 *
 * Two variants:
 *   - reason === "session_cancelled" — the entire session was scrapped
 *     (weather, no instructor, etc.). Tone: apologetic, full refund.
 *   - reason === "admin_refund"     — booking-specific cancellation
 *     by staff (e.g. comp / overrode the cancel-window). Tone: neutral.
 */
export function renderBookingCancelledByAdmin(
  ctx: BookingCancelledByAdminContext,
): MessageVariants {
  const startStr = formatSessionTime(ctx.session.startsAt, ctx.venue.timezone);
  const sportLabel = ctx.session.formatLabel
    ? `${ctx.session.sportOrClassLabel} (${ctx.session.formatLabel})`
    : ctx.session.sportOrClassLabel;
  const link = sessionDetailLink(ctx);
  const name = recipientName(ctx);
  const refundLine =
    ctx.refunded && ctx.booking.amountPaidCents > 0
      ? `A refund of ${dollars(ctx.booking.amountPaidCents)} is on its way to your card (5–10 business days).`
      : ctx.booking.amountPaidCents === 0
        ? "No charge to refund."
        : "Your refund is being processed — we'll email you if there's an issue.";

  const subject =
    ctx.reason === "session_cancelled"
      ? `Session cancelled — ${sportLabel} at ${ctx.venue.name}`
      : `Booking cancelled — ${sportLabel} at ${ctx.venue.name}`;

  const headline =
    ctx.reason === "session_cancelled"
      ? `We had to cancel ${sportLabel} on ${startStr}.`
      : `Your booking for ${sportLabel} on ${startStr} has been cancelled by staff.`;

  const smsBody =
    ctx.reason === "session_cancelled"
      ? `[Aspire] We had to cancel ${sportLabel} at ${ctx.venue.name} on ${startStr}. ${refundLine} Details: ${link}`
      : `[Aspire] Your booking for ${sportLabel} on ${startStr} has been cancelled. ${refundLine} Details: ${link}`;

  const html = `
    <h2>${escapeHtml(subject)}</h2>
    <p>Hi ${escapeHtml(name)},</p>
    <p>${escapeHtml(headline)}</p>
    <p>${escapeHtml(refundLine)}</p>
    ${
      ctx.reason === "session_cancelled"
        ? `<p>Sorry for the disruption — we'll see you next time.</p>`
        : ""
    }
    <p><a href="${link}">View session details &rarr;</a></p>
  `.trim();

  const text = [
    subject,
    "",
    `Hi ${name},`,
    headline,
    refundLine,
    "",
    `Details: ${link}`,
  ].join("\n");

  const tg =
    `<b>${escapeHtml(subject)}</b>\n` +
    `${escapeHtml(headline)}\n` +
    `${escapeHtml(refundLine)}\n` +
    `<a href="${link}">View session →</a>`;

  return {
    sms: { body: smsBody },
    email: { subject, html, text },
    telegram: { body: tg, parse_mode: "HTML" },
  };
}
