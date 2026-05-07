import {
  escapeHtml,
  formatTime,
  fullLink,
  minutesSince,
  type MessageVariants,
  type RenderContext,
} from "./types";

export function renderFinalEscalation(ctx: RenderContext): MessageVariants {
  const minsLate = Math.max(0, minutesSince(ctx.completion.expectedAt));
  const subject = `[${ctx.venue.name}] DIRECTOR NOTIFIED: ${ctx.activity.name} (${minsLate}m overdue)`;
  const link = fullLink(ctx);
  const expectedStr = formatTime(ctx.completion.expectedAt, ctx.venue.timezone);

  return {
    sms: {
      body: `[Aspire] DIRECTOR NOTIFIED — please intervene. ${ctx.activity.name} is ${minsLate}m overdue at ${ctx.venue.name}. Open: ${link}`,
    },
    email: {
      subject,
      html: `<h2>${escapeHtml(subject)}</h2><p>${escapeHtml(ctx.activity.description)}</p><p><b>Director notified — please intervene.</b></p><p>Expected by: ${escapeHtml(expectedStr)}</p><p><a href="${link}">Open the activity →</a></p>`,
      text: `${subject}\n\nDirector notified — please intervene. Expected by ${expectedStr}.\nOpen: ${link}`,
    },
    telegram: {
      body: `<b>DIRECTOR NOTIFIED — please intervene</b>\n${escapeHtml(ctx.activity.name)} is ${minsLate}m overdue at ${escapeHtml(ctx.venue.name)}.\n<a href="${link}">Open the activity →</a>`,
      parse_mode: "HTML",
    },
  };
}
