import type { ClassifiedIntent, ClassifyInput } from "./classifier";

/**
 * Rule-based fallback classifier.
 *
 * Used when the LLM is unavailable or errors out. Intentionally dumb — only
 * recognizes the highest-frequency patterns with enough confidence to be safe,
 * and routes everything else to admin. Never attempts to execute mutations
 * without the LLM's judgment.
 */

export function ruleBasedClassify(input: ClassifyInput): ClassifiedIntent {
  const text = input.message.toLowerCase().trim();

  // Explicit help / stop (handled upstream but classify defensively)
  if (/^(help|stop|unsubscribe|cancel|end|quit)$/.test(text)) {
    return {
      intent: "channel_preference",
      confidence: 0.95,
      action: "bot_respond",
      suggestedResponse: "",
      reasoning: "Rule-based: recognized compliance keyword.",
    };
  }

  // Schedule queries
  if (
    /\b(schedule|when|what time|where|field|location|practice|game)\b/.test(
      text,
    )
  ) {
    return {
      intent: "schedule_query",
      confidence: 0.7,
      action: "bot_respond",
      suggestedResponse:
        "Let me pull up the schedule for you — one moment.",
      reasoning: "Rule-based: schedule keyword match.",
    };
  }

  // Sickness / absence
  if (
    /\b(sick|can't (make|come)|cannot make|won'?t be|missing|miss tonight|out tonight|out tomorrow)\b/.test(
      text,
    )
  ) {
    return {
      intent: "rsvp_absent",
      confidence: 0.55,
      action: "route_to_admin",
      routingReason:
        "Rule-based classifier detected absence intent but cannot safely execute without LLM.",
      reasoning:
        "Rule-based: absence keyword match; routed to admin because mutation confidence is below threshold without LLM.",
    };
  }

  // Payment / money
  if (/\b(pay|payment|charge|refund|invoice|fee|card|billed|receipt)\b/.test(text)) {
    return {
      intent: "payment_question",
      confidence: 0.8,
      action: "route_to_admin",
      routingReason: "Payment question — routing to admin.",
      reasoning: "Rule-based: payment keyword match.",
    };
  }

  // Registration
  if (/\b(register|sign up|signup|enroll|enrolment|enrollment)\b/.test(text)) {
    return {
      intent: "registration_question",
      confidence: 0.75,
      action: "route_to_admin",
      routingReason: "Registration question — routing to admin.",
      reasoning: "Rule-based: registration keyword match.",
    };
  }

  // Injury / medical — urgent
  if (
    /\b(hurt|injured|injury|ankle|knee|er|hospital|emergency|pain|ambulance)\b/.test(
      text,
    )
  ) {
    return {
      intent: "coach_question",
      confidence: 0.9,
      action: "route_to_coach",
      routingReason:
        "URGENT: possible injury mention — route to coach immediately.",
      reasoning: "Rule-based: medical keyword match with urgency flag.",
    };
  }

  // Default: unclear, route to admin
  return {
    intent: "unclear",
    confidence: 0.3,
    action: "route_to_admin",
    routingReason:
      "Rule-based fallback could not confidently classify this message.",
    reasoning:
      "Rule-based: no keyword pattern matched; defaulting to admin inbox.",
  };
}
