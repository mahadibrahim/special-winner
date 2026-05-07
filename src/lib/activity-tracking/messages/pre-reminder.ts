import {
  escapeHtml,
  formatTime,
  fullLink,
  minutesUntil,
  type MessageVariants,
  type RenderContext,
} from "./types";

export function renderPreReminder(ctx: RenderContext): MessageVariants {
  const minsUntil = Math.max(0, minutesUntil(ctx.completion.expectedAt));
  const subject = `[${ctx.venue.name}] ${ctx.activity.name} due in ${minsUntil}m`;
  const link = fullLink(ctx);
  const expectedStr = formatTime(ctx.completion.expectedAt, ctx.venue.timezone);

  return {
    sms: {
      body: `[Aspire] ${ctx.activity.name} due in ${minsUntil} min at ${ctx.venue.name}. Open: ${link}`,
    },
    email: {
      subject,
      html: `<h2>${escapeHtml(subject)}</h2><p>${escapeHtml(ctx.activity.description)}</p><p>Expected by: ${escapeHtml(expectedStr)}</p><p><a href="${link}">Open the activity →</a></p>`,
      text: `${subject}\n\nExpected by ${expectedStr}.\nOpen: ${link}`,
    },
    telegram: {
      body: `<b>${escapeHtml(ctx.activity.name)}</b> is due in ${minsUntil} min at ${escapeHtml(ctx.venue.name)}.\n<a href="${link}">Open the activity →</a>`,
      parse_mode: "HTML",
    },
  };
}
