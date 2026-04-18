export type MessageType =
  | "team_broadcast_general"
  | "event_change"
  | "coach_urgent_override"
  | "payment_receipt"
  | "payment_failed"
  | "refund_issued"
  | "registration_confirmation"
  | "password_reset"
  | "phone_verification"
  | "security_alert"
  | "marketing"
  | "day_before_reminder"
  | "event_cancellation"

export type ChannelRoute = {
  telegramGroup: boolean
  telegramDM: boolean
  sms: "all_recipients" | "unlinked_only" | "none"
  email: "all_recipients" | "unlinked_only" | "none"
}

export type RoutingContext = {
  messageType: MessageType
  hoursUntilEvent?: number // for event_change — triggers SMS when ≤24
  isUrgent?: boolean // manual override
}

/**
 * Resolve a routing decision for a given message type + context.
 * Returns the channels that should be used.
 */
export function resolveRouting(ctx: RoutingContext): ChannelRoute {
  const { messageType, hoursUntilEvent, isUrgent } = ctx

  // Urgent override always fans SMS to all, regardless of message type
  if (isUrgent) {
    return {
      telegramGroup: true,
      telegramDM: false,
      sms: "all_recipients",
      email: "unlinked_only",
    }
  }

  switch (messageType) {
    case "team_broadcast_general":
      return {
        telegramGroup: true,
        telegramDM: false,
        sms: "none",
        email: "unlinked_only",
      }

    case "event_change":
    case "event_cancellation":
      if (hoursUntilEvent !== undefined && hoursUntilEvent <= 24) {
        return {
          telegramGroup: true,
          telegramDM: false,
          sms: "all_recipients",
          email: "unlinked_only",
        }
      }
      return {
        telegramGroup: true,
        telegramDM: false,
        sms: "none",
        email: "unlinked_only",
      }

    case "coach_urgent_override":
      return {
        telegramGroup: true,
        telegramDM: false,
        sms: "all_recipients",
        email: "unlinked_only",
      }

    case "day_before_reminder":
      return {
        telegramGroup: true,
        telegramDM: false,
        sms: "none",
        email: "unlinked_only",
      }

    case "payment_receipt":
    case "refund_issued":
    case "registration_confirmation":
      return {
        telegramGroup: false,
        telegramDM: true,
        sms: "none",
        email: "all_recipients",
      }

    case "payment_failed":
      return {
        telegramGroup: false,
        telegramDM: true,
        sms: "all_recipients",
        email: "all_recipients",
      }

    case "password_reset":
      return {
        telegramGroup: false,
        telegramDM: false,
        sms: "all_recipients",
        email: "all_recipients",
      }

    case "phone_verification":
      return {
        telegramGroup: false,
        telegramDM: false,
        sms: "all_recipients",
        email: "none",
      }

    case "security_alert":
      return {
        telegramGroup: false,
        telegramDM: false,
        sms: "all_recipients",
        email: "all_recipients",
      }

    case "marketing":
      return {
        telegramGroup: false,
        telegramDM: true,
        sms: "none",
        email: "none", // opt-in only, handled separately
      }
  }
}
