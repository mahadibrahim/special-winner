/**
 * Message template types + shared formatting helpers.
 *
 * Each stage renderer (pre_reminder, overdue_alert, escalation,
 * final_escalation) returns the same shape: SMS body, email
 * subject/html/text, and a Telegram body with parse_mode. The dispatch
 * layer picks which channels to actually send based on what each
 * recipient has configured.
 */

export interface MessageVariants {
  sms: { body: string };
  email: { subject: string; html: string; text: string };
  telegram: { body: string; parse_mode: "HTML" };
}

export interface RenderContext {
  activity: { id: string; name: string; description: string };
  completion: { id: string; expectedAt: Date };
  game: { id: string; scheduledAt: Date };
  venue: { id: string; name: string; timezone?: string };
  recipient: { id: string; email: string | null };
  publicAppUrl: string;
  /** Optional handoff target for stages that mention the next role. */
  handoffRole?: string | null;
}

export function fullLink(ctx: RenderContext): string {
  return `${ctx.publicAppUrl}/admin/activity-completions/${ctx.completion.id}`;
}

export function formatTime(d: Date, tz?: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz ?? "America/New_York",
    dateStyle: "short",
    timeStyle: "short",
  }).format(d);
}

export function minutesUntil(target: Date, now: Date = new Date()): number {
  return Math.round((target.getTime() - now.getTime()) / 60_000);
}

export function minutesSince(target: Date, now: Date = new Date()): number {
  return Math.round((now.getTime() - target.getTime()) / 60_000);
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
