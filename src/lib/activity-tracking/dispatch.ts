/**
 * Dispatch — render the appropriate message variants for a stage and
 * deliver them to each recipient on every channel they have configured.
 *
 * Channel selection per recipient:
 *   - email      → delivered when users.email is set
 *   - sms        → delivered when users.phone is set; bypasses opt-in
 *                  (workers receive operational comms by employment relationship,
 *                   not consumer opt-in; sms.send.ts honors bypassOptInCheck)
 *   - telegram   → delivered when users.telegramChatId is set, via
 *                  sendTelegramRaw (parent-targeted helper does not apply
 *                  to staff recipients)
 *
 * Returns one DispatchResult per (recipient, channel) attempt — sent or
 * failed — for the orchestrator to append to reminders_fired so we never
 * re-fire the same stage.
 */
import type { Stage } from "./stage";
import type { Recipient } from "./resolve-recipients";
import type { MessageVariants, RenderContext } from "./messages/types";
import { renderPreReminder } from "./messages/pre-reminder";
import { renderOverdueAlert } from "./messages/overdue-alert";
import { renderEscalation } from "./messages/escalation";
import { renderFinalEscalation } from "./messages/final-escalation";
import { sendSms } from "@/lib/sms/send";
import { sendEmail } from "@/lib/email";
import { sendTelegramRaw } from "@/lib/telegram/send";

export type Channel = "email" | "telegram" | "sms";

export function workerChannelsConfigured(user: {
  email: string | null;
  telegramChatId: string | null;
  phone: string | null;
}): Channel[] {
  const channels: Channel[] = [];
  if (user.email) channels.push("email");
  if (user.telegramChatId) channels.push("telegram");
  if (user.phone) channels.push("sms");
  return channels;
}

const RENDERERS: Record<Stage, (ctx: RenderContext) => MessageVariants> = {
  pre_reminder: renderPreReminder,
  overdue_alert: renderOverdueAlert,
  escalation: renderEscalation,
  final_escalation: renderFinalEscalation,
};

export interface DispatchResult {
  stage: Stage;
  channel: Channel;
  recipient_user_id: string;
  fired_at: string;
  delivery_status: "sent" | "failed";
  error?: string;
}

export async function dispatchReminders(
  stage: Stage,
  recipients: Recipient[],
  ctx: Omit<RenderContext, "recipient">,
  organizationId: string,
): Promise<DispatchResult[]> {
  const results: DispatchResult[] = [];
  const renderer = RENDERERS[stage];

  for (const user of recipients) {
    const variants = renderer({
      ...ctx,
      recipient: { id: user.id, email: user.email },
    });
    const channels = workerChannelsConfigured(user);

    for (const channel of channels) {
      const fired_at = new Date().toISOString();
      try {
        if (channel === "email" && user.email) {
          const r = await sendEmail({
            to: user.email,
            subject: variants.email.subject,
            html: variants.email.html,
            text: variants.email.text,
          });
          if (!r.success) {
            results.push({
              stage,
              channel,
              recipient_user_id: user.id,
              fired_at,
              delivery_status: "failed",
              error: r.error,
            });
            continue;
          }
        } else if (channel === "sms" && user.phone) {
          const r = await sendSms({
            to: user.phone,
            body: variants.sms.body,
            organizationId,
            bypassOptInCheck: true,
          });
          if (!r.ok) {
            results.push({
              stage,
              channel,
              recipient_user_id: user.id,
              fired_at,
              delivery_status: "failed",
              error: r.reason + (r.error ? `: ${r.error}` : ""),
            });
            continue;
          }
        } else if (channel === "telegram" && user.telegramChatId) {
          const r = await sendTelegramRaw(
            user.telegramChatId,
            variants.telegram.body,
            { parseMode: variants.telegram.parse_mode },
          );
          if (!r.ok) {
            results.push({
              stage,
              channel,
              recipient_user_id: user.id,
              fired_at,
              delivery_status: "failed",
              error: r.reason + (r.error ? `: ${r.error}` : ""),
            });
            continue;
          }
        }
        results.push({
          stage,
          channel,
          recipient_user_id: user.id,
          fired_at,
          delivery_status: "sent",
        });
      } catch (err) {
        results.push({
          stage,
          channel,
          recipient_user_id: user.id,
          fired_at,
          delivery_status: "failed",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  return results;
}
