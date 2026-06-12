import {
  claimLink,
  escapeHtml,
  formatSessionTime,
  minutesUntil,
  recipientName,
  type MessageVariants,
  type WaitlistPromotedContext,
} from "./types";
import { renderEmail } from "@/lib/email/render";
import { DropInWaitlistPromotedEmail } from "@/lib/email/templates/dropin-waitlist-promoted";

/**
 * Waitlist promotion — fired when a confirmed booker cancels (or a
 * pending_claim expires) and the next waitlister is promoted to
 * `pending_claim`. The body includes the magic claim link with the
 * one-time `promotion_token` and a countdown to the expiry window
 * (default 30 min).
 *
 * The email channel renders the shared branded transactional template;
 * SMS and Telegram stay plain-text.
 */
export async function renderWaitlistPromoted(
  ctx: WaitlistPromotedContext,
): Promise<MessageVariants> {
  const startStr = formatSessionTime(ctx.session.startsAt, ctx.venue.timezone);
  const minsLeft = Math.max(0, minutesUntil(ctx.promotionExpiresAt));
  const sportLabel = ctx.session.formatLabel
    ? `${ctx.session.sportOrClassLabel} (${ctx.session.formatLabel})`
    : ctx.session.sportOrClassLabel;
  const link = claimLink(ctx);
  const name = recipientName(ctx);
  const subject = `A spot opened up — claim within ${minsLeft} min`;

  const smsBody =
    `[Aspire] A spot opened for ${sportLabel} at ${ctx.venue.name} on ${startStr}. ` +
    `Claim within ${minsLeft} min: ${link}`;

  const { html, text } = await renderEmail(
    DropInWaitlistPromotedEmail({
      recipientName: name,
      sportLabel,
      venueName: ctx.venue.name,
      whenLabel: startStr,
      minutesLeft: minsLeft,
      claimUrl: link,
      brand: ctx.brand,
    }),
  );

  const tg =
    `<b>${escapeHtml(subject)}</b>\n` +
    `${escapeHtml(sportLabel)} at ${escapeHtml(ctx.venue.name)} on ${escapeHtml(startStr)}\n` +
    `Claim within <b>${minsLeft} min</b>:\n` +
    `<a href="${link}">Claim my spot →</a>`;

  return {
    sms: { body: smsBody },
    email: { subject, html, text },
    telegram: { body: tg, parse_mode: "HTML" },
  };
}
