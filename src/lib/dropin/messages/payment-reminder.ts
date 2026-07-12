import {
  escapeHtml,
  formatSessionTime,
  recipientName,
  type MessageVariants,
  type PaymentReminderContext,
} from "./types";
import { renderEmail } from "@/lib/email/render";
import { DropInPaymentReminderEmail } from "@/lib/email/templates/dropin-payment-reminder";
import { normalizeBrand } from "@/lib/organization/soccerone-routing";

/**
 * Walk-in payment-hold reminder — the single one-shot nudge fired by
 * `sendDuePaymentReminders` (src/lib/dropin/payment-reminder.ts) shortly
 * before a kiosk walk-in hold's `promotionExpiresAt`. Copy mirrors the
 * spec verbatim: "Your spot for {session label} is held until {time in
 * venue tz}. Complete payment to keep it: {link}".
 *
 * The email channel renders the shared branded transactional template so
 * it matches every other Aspire/SoccerOne email; SMS and Telegram stay
 * plain-text.
 */
export async function renderPaymentReminder(
  ctx: PaymentReminderContext,
): Promise<MessageVariants> {
  const heldUntilStr = formatSessionTime(ctx.expiresAt, ctx.venue.timezone);
  const sportLabel = ctx.session.formatLabel
    ? `${ctx.session.sportOrClassLabel} (${ctx.session.formatLabel})`
    : ctx.session.sportOrClassLabel;
  const link = ctx.selfServeUrl;
  const name = recipientName(ctx);
  const brand = normalizeBrand(ctx.brand);
  const brandLabel = brand === "soccerone" ? "SoccerOne" : "Aspire";
  const subject = `Complete payment to keep your spot — ${sportLabel}`;

  const smsBody =
    `[${brandLabel}] Your spot for ${sportLabel} is held until ${heldUntilStr}. ` +
    `Complete payment to keep it: ${link}`;

  const { html, text } = await renderEmail(
    DropInPaymentReminderEmail({
      recipientName: name,
      sportLabel,
      venueName: ctx.venue.name,
      heldUntilLabel: heldUntilStr,
      payUrl: link,
      brand,
    }),
  );

  const tg =
    `<b>${escapeHtml(subject)}</b>\n` +
    `Your spot for ${escapeHtml(sportLabel)} is held until ${escapeHtml(heldUntilStr)}.\n` +
    `<a href="${link}">Complete payment →</a>`;

  return {
    sms: { body: smsBody },
    email: { subject, html, text },
    telegram: { body: tg, parse_mode: "HTML" },
  };
}
