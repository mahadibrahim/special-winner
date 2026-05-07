import {
  claimLink,
  escapeHtml,
  formatSessionTime,
  minutesUntil,
  recipientName,
  type MessageVariants,
  type WaitlistPromotedContext,
} from "./types";

/**
 * Waitlist promotion — fired when a confirmed booker cancels (or a
 * pending_claim expires) and the next waitlister is promoted to
 * `pending_claim`. The body includes the magic claim link with the
 * one-time `promotion_token` and a countdown to the expiry window
 * (default 30 min).
 */
export function renderWaitlistPromoted(
  ctx: WaitlistPromotedContext,
): MessageVariants {
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

  const html = `
    <h2>${escapeHtml(subject)}</h2>
    <p>Hi ${escapeHtml(name)},</p>
    <p>Good news — a spot opened up for <b>${escapeHtml(sportLabel)}</b> at <b>${escapeHtml(ctx.venue.name)}</b> on ${escapeHtml(startStr)}.</p>
    <p>Claim it within <b>${minsLeft} minutes</b> or it goes to the next person.</p>
    <p><a href="${link}" style="display:inline-block; padding:12px 20px; background:#0a0a0a; color:#fff; border-radius:6px; text-decoration:none;">Claim my spot &rarr;</a></p>
    <p style="color:#666; font-size:13px;">If the link expires, you'll automatically stay on the waitlist for the next opening.</p>
  `.trim();

  const text = [
    subject,
    "",
    `Hi ${name},`,
    `A spot opened up for ${sportLabel} at ${ctx.venue.name} on ${startStr}.`,
    `Claim within ${minsLeft} minutes:`,
    link,
  ].join("\n");

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
