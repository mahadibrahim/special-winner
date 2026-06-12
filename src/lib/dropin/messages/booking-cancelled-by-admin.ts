import {
  dollars,
  escapeHtml,
  formatSessionTime,
  recipientName,
  sessionDetailLink,
  type BookingCancelledByAdminContext,
  type MessageVariants,
} from "./types";
import { renderEmail } from "@/lib/email/render";
import { DropInBookingCancelledEmail } from "@/lib/email/templates/dropin-booking-cancelled";

/**
 * Admin-cancelled / admin-refunded booking notice.
 *
 * Two variants:
 *   - reason === "session_cancelled" — the entire session was scrapped
 *     (weather, no instructor, etc.). Tone: apologetic, full refund.
 *   - reason === "admin_refund"     — booking-specific cancellation
 *     by staff (e.g. comp / overrode the cancel-window). Tone: neutral.
 *
 * The email channel renders the shared branded transactional template;
 * SMS and Telegram stay plain-text.
 */
export async function renderBookingCancelledByAdmin(
  ctx: BookingCancelledByAdminContext,
): Promise<MessageVariants> {
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

  const { html, text } = await renderEmail(
    DropInBookingCancelledEmail({
      recipientName: name,
      sportLabel,
      venueName: ctx.venue.name,
      whenLabel: startStr,
      headline,
      refundLine,
      sessionUrl: link,
      reason: ctx.reason,
      brand: ctx.brand,
    }),
  );

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
