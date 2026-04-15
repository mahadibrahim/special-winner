import type { BotActionDefinition, BotActionResult } from "./types";

/**
 * faq_response — returns a curated answer to a common question.
 * Read-only. In Phase 1, the FAQ is a small in-memory set. Future work moves
 * it to the `organizations.settings` JSONB for per-org customization.
 */

const FAQ_ENTRIES: Record<string, string> = {
  refund_policy:
    "Refunds are available within 14 days of registration, minus a small processing fee. After 14 days, refunds are case-by-case — reach out and we'll work it out.",
  weather_cancellation:
    "Practices and games are typically cancelled for lightning, severe weather, or unplayable fields. We send a text to all affected parents within 30 minutes of any cancellation.",
  makeup_policy:
    "We do our best to reschedule cancelled sessions. Makeup practices are added at the end of the season if we have field availability.",
  uniform:
    "Your kid's uniform and jersey number will be assigned by their coach in the first week of the season. Watch for a message with pickup details.",
  photo_gallery:
    "Photos from games and team events show up in your parent dashboard under your kid's profile. Coaches upload them after sessions.",
  late_pickup:
    "If you're running late for pickup, text us — we'll let the coach know to wait with your kid at the bench.",
};

export const faqResponse: BotActionDefinition = {
  name: "faq_response",
  description:
    "Return a curated FAQ answer. Params: { topic: string }. Valid topics: " +
    Object.keys(FAQ_ENTRIES).join(", "),
  readOnly: true,
  reversible: false,
  requiresConfirmation: false,

  async handler(params): Promise<BotActionResult> {
    const topic = typeof params.topic === "string" ? params.topic : null;
    if (!topic || !(topic in FAQ_ENTRIES)) {
      return {
        ok: false,
        responseBody:
          "I'm not sure about that one — let me pass it to a real person.",
        errorReason: `unknown FAQ topic: ${topic}`,
        suggestEscalation: true,
      };
    }
    return {
      ok: true,
      responseBody: FAQ_ENTRIES[topic],
    };
  },
};

export const AVAILABLE_FAQ_TOPICS = Object.keys(FAQ_ENTRIES);
