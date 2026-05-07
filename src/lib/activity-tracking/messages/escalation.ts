import {
  escapeHtml,
  formatTime,
  fullLink,
  minutesSince,
  type MessageVariants,
  type RenderContext,
} from "./types";

export function renderEscalation(ctx: RenderContext): MessageVariants {
  const minsLate = Math.max(0, minutesSince(ctx.completion.expectedAt));
  const handoff = ctx.handoffRole ?? "the next role";
  const subject = `[${ctx.venue.name}] Escalating: ${ctx.activity.name} (${minsLate}m overdue)`;
  const link = fullLink(ctx);
  const expectedStr = formatTime(ctx.completion.expectedAt, ctx.venue.timezone);

  return {
    sms: {
      body: `[Aspire] Escalating ${ctx.activity.name} to ${handoff} — ${minsLate}m overdue at ${ctx.venue.name}. Open: ${link}`,
    },
    email: {
      subject,
      html: `<h2>${escapeHtml(subject)}</h2><p>${escapeHtml(ctx.activity.description)}</p><p>Now escalating to: <b>${escapeHtml(handoff)}</b></p><p>Expected by: ${escapeHtml(expectedStr)}</p><p><a href="${link}">Open the activity →</a></p>`,
      text: `${subject}\n\nEscalating to ${handoff}. Expected by ${expectedStr}.\nOpen: ${link}`,
    },
    telegram: {
      body: `<b>Escalating: ${escapeHtml(ctx.activity.name)}</b>\n${minsLate}m overdue at ${escapeHtml(ctx.venue.name)}. Now escalating to <b>${escapeHtml(handoff)}</b>.\n<a href="${link}">Open the activity →</a>`,
      parse_mode: "HTML",
    },
  };
}
