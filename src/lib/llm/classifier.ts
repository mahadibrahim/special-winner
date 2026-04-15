import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropicClient, getClassifierModel, isLlmConfigured } from "./client";
import { ruleBasedClassify } from "./rule-based-classifier";

/**
 * Parent message intent classifier.
 *
 * Takes an inbound parent message plus structured context (who sent it, which
 * kids they have, upcoming events, etc.) and returns a decision about:
 *   - what the parent's intent is
 *   - how confident we are
 *   - what action to take (bot response, bot execute, route to coach, route to admin)
 *
 * Primary path uses Anthropic Haiku with tool-use-style structured output and
 * aggressive prompt caching on the system prompt. Fallback path is a dumb
 * keyword-based classifier that only recognizes the highest-frequency intents
 * and routes everything else to admin.
 */

export type IntentType =
  | "schedule_query"
  | "rsvp_absent"
  | "rsvp_present"
  | "cancellation_acknowledgment"
  | "payment_question"
  | "registration_question"
  | "coach_question"
  | "admin_question"
  | "general_chitchat"
  | "channel_preference"
  | "unclear";

export type ActionType =
  | "bot_respond"
  | "bot_execute"
  | "route_to_coach"
  | "route_to_admin";

export interface ExecutableAction {
  name: string;
  params: Record<string, unknown>;
  requiresConfirmation: boolean;
}

export interface ClassifiedIntent {
  intent: IntentType;
  confidence: number; // 0.0 to 1.0
  action: ActionType;
  executableAction?: ExecutableAction;
  routingReason?: string;
  suggestedResponse?: string;
  reasoning: string;
}

export interface ClassifierContext {
  parentName: string;
  parentUserId: string;
  organizationId: string;
  organizationName: string;
  kids: Array<{
    id: string;
    firstName: string;
    age: number | null;
    teams: Array<{
      id: string;
      name: string;
      coachName: string | null;
      sport: string | null;
    }>;
  }>;
  upcomingEvents: Array<{
    id: string;
    type: "practice" | "game" | "other";
    scheduledAt: string; // ISO
    location: string | null;
    teamName: string | null;
  }>;
  recentConversation?: Array<{
    direction: "inbound" | "outbound";
    sender: string;
    body: string;
  }>;
  pendingConfirmation?: {
    actionName: string;
    params: Record<string, unknown>;
    confirmationBody: string;
  } | null;
}

export interface ClassifyInput {
  message: string;
  context: ClassifierContext;
}

// Confidence thresholds (per spec section "Understanding model")
export const EXECUTE_THRESHOLD = 0.85;
export const CONFIRM_THRESHOLD = 0.6;

/**
 * Classify an inbound parent message. Returns a structured intent + action decision.
 * Never throws — on LLM failure, degrades to the rule-based classifier.
 */
export async function classifyMessage(
  input: ClassifyInput,
): Promise<ClassifiedIntent> {
  if (!isLlmConfigured()) {
    return ruleBasedClassify(input);
  }

  try {
    return await classifyWithLlm(input);
  } catch (err) {
    console.error("LLM classifier error, falling back to rule-based:", err);
    return ruleBasedClassify(input);
  }
}

// ------------------------------------------------------------
// Anthropic-backed classifier
// ------------------------------------------------------------

async function classifyWithLlm(
  input: ClassifyInput,
): Promise<ClassifiedIntent> {
  const client = getAnthropicClient();
  const model = getClassifierModel();

  const systemPrompt = buildSystemPrompt(input.context);
  const userPrompt = buildUserPrompt(input);

  const response = await client.messages.create({
    model,
    max_tokens: 600,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: "tool", name: "classify_parent_message" },
    messages: [{ role: "user", content: userPrompt }],
  });

  // The tool_use content block is what we care about
  const toolUse = response.content.find(
    (block) => block.type === "tool_use",
  ) as { type: "tool_use"; input: unknown } | undefined;
  if (!toolUse) {
    throw new Error("Anthropic response missing tool_use block");
  }

  const parsed = toolUse.input as Partial<ClassifiedIntent>;

  if (
    !parsed.intent ||
    typeof parsed.confidence !== "number" ||
    !parsed.action ||
    !parsed.reasoning
  ) {
    throw new Error("Anthropic tool output missing required fields");
  }

  return {
    intent: parsed.intent as IntentType,
    confidence: clamp01(parsed.confidence),
    action: parsed.action as ActionType,
    executableAction: parsed.executableAction,
    routingReason: parsed.routingReason,
    suggestedResponse: parsed.suggestedResponse,
    reasoning: parsed.reasoning,
  };
}

const CLASSIFY_TOOL: Anthropic.Tool = {
  name: "classify_parent_message",
  description:
    "Classify an inbound parent message into an intent, confidence score, and next action.",
  input_schema: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        enum: [
          "schedule_query",
          "rsvp_absent",
          "rsvp_present",
          "cancellation_acknowledgment",
          "payment_question",
          "registration_question",
          "coach_question",
          "admin_question",
          "general_chitchat",
          "channel_preference",
          "unclear",
        ],
        description: "The parent's apparent intent",
      },
      confidence: {
        type: "number",
        description:
          "Confidence that the intent classification is correct, 0.0 (uncertain) to 1.0 (certain).",
      },
      action: {
        type: "string",
        enum: ["bot_respond", "bot_execute", "route_to_coach", "route_to_admin"],
        description:
          "What to do next. 'bot_respond' for informational replies. 'bot_execute' when the bot should perform a mutation (RSVP, cancel, etc.). 'route_to_coach' for kid-specific questions a coach should answer. 'route_to_admin' for payments, registration, refunds, or anything unclear.",
      },
      executableAction: {
        type: "object",
        description:
          "Set only when action is 'bot_execute'. Describes which bot action to invoke.",
        properties: {
          name: {
            type: "string",
            description:
              "Name of the bot action (e.g. 'rsvp_absent', 'lookup_schedule', 'switch_primary_channel').",
          },
          params: {
            type: "object",
            description:
              "Parameters to pass to the action handler. Must include any ids needed (kidId, eventId, etc.).",
          },
          requiresConfirmation: {
            type: "boolean",
            description:
              "True if the bot should ask the parent to confirm before executing. Use true for mutations with confidence under 0.85 or any destructive action.",
          },
        },
        required: ["name", "params", "requiresConfirmation"],
      },
      routingReason: {
        type: "string",
        description:
          "When routing to a human, the short one-line reason (shown to staff in the inbox).",
      },
      suggestedResponse: {
        type: "string",
        description:
          "For bot_respond and bot_execute, the natural-language response body the bot should send. Keep SMS-friendly: under 160 chars when possible, no markdown, no emoji unless it's natural.",
      },
      reasoning: {
        type: "string",
        description:
          "Short one-line explanation for why this classification was chosen. Used for audit and debugging.",
      },
    },
    required: ["intent", "confidence", "action", "reasoning"],
  },
};

// ------------------------------------------------------------
// Prompt construction
// ------------------------------------------------------------

function buildSystemPrompt(ctx: ClassifierContext): string {
  return `You are the intent classifier for Aspire Sports, a youth sports platform. Parents message the organization via SMS and email. Your job is to classify each inbound message so the system can either respond automatically, execute a low-risk action, or route to a human (coach or admin).

You are not a conversationalist. You emit structured classifications only.

# Organization
${ctx.organizationName}

# Supported parent intents

- schedule_query: "when is Maya's next practice?", "what time is Saturday's game?", "where is the field?"
- rsvp_absent: "Maya is sick tonight", "we can't make practice Tuesday", "she'll miss this week's game"
- rsvp_present: reversing an absence, "she can come after all", "false alarm Maya is fine"
- cancellation_acknowledgment: replying to a cancellation notice, "got it", "thanks", "ok"
- payment_question: anything about fees, invoices, refunds, card charges, payment plans
- registration_question: signing up, switching teams, registration status, program availability
- coach_question: clinical judgment, injury, development progress, training — needs the coach's eye
- admin_question: roster changes, compliance, policy, anything administrative
- general_chitchat: social / conversational messages without a clear ask
- channel_preference: "text me instead", "use email for this", "stop sending me so many messages"
- unclear: you genuinely cannot tell what they want

# Confidence thresholds the caller applies

- >= 0.85: system executes the action directly
- 0.60 to 0.85: system asks the parent to confirm first
- < 0.60: system routes to a human

# Bot actions available (only use for 'bot_execute')

- lookup_schedule(parentUserId) — read-only, returns upcoming events for the parent's kids
- lookup_next_practice(kidId) — read-only, returns next practice for a kid
- lookup_team_info(kidId) — read-only, returns coach, roster, field
- rsvp_absent(kidId, eventId) — mutation, marks kid absent. Always set requiresConfirmation=true unless the intent is unambiguous.
- rsvp_present(kidId, eventId) — mutation, reverses an absence
- switch_primary_channel(channel) — mutation, updates messaging preferences. Accepts 'sms' | 'email' | 'telegram'.
- faq_response(topic) — read-only, returns a curated FAQ answer

# Routing rules when action is route_to_coach or route_to_admin

- coach_question → route_to_coach. The coach will see parent and kid context.
- payment_question, registration_question, admin_question → route_to_admin.
- general_chitchat → route_to_admin (low priority but still reaches a human).
- unclear → route_to_admin with a routingReason explaining the ambiguity.

# Safety rules

- Never fabricate schedule data, kid names, or team assignments. Use only what's in the parent context.
- When in doubt between executing and routing, ROUTE. Humans are the safe default.
- If a message mentions money, payment, card, refund, invoice, fee — always classify as payment_question and route_to_admin.
- If a message mentions an injury, pain, ER, hospital, or medical emergency — classify as coach_question with routing_reason mentioning urgency. Never try to bot_respond.
- SMS-friendly responses only. No markdown. No emoji unless natural. Keep suggestedResponse under 160 chars when you can.`;
}

function buildUserPrompt(input: ClassifyInput): string {
  const { context, message } = input;

  const kidLines = context.kids.map((k) => {
    const teams = k.teams.map(
      (t) =>
        `${t.name} (${t.sport ?? "sport?"}, coach ${t.coachName ?? "TBD"})`,
    ).join(", ");
    return `- ${k.firstName} (age ${k.age ?? "?"}): ${teams || "no teams"}`;
  });

  const eventLines = context.upcomingEvents.slice(0, 8).map((e) => {
    const when = new Date(e.scheduledAt).toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
    return `- ${e.type} for ${e.teamName ?? "?"} on ${when} at ${e.location ?? "?"} (id: ${e.id})`;
  });

  const recentConversationSection =
    context.recentConversation && context.recentConversation.length > 0
      ? `\n# Recent conversation (for context)\n${context.recentConversation
          .slice(-5)
          .map((m) => `${m.sender} (${m.direction}): ${m.body}`)
          .join("\n")}`
      : "";

  const pendingSection = context.pendingConfirmation
    ? `\n# Pending confirmation\nThe parent was just asked to confirm: ${context.pendingConfirmation.confirmationBody}\nIf this message is a YES/NO/confirm/cancel reply, classify accordingly and reference pending action '${context.pendingConfirmation.actionName}'.`
    : "";

  return `# Parent: ${context.parentName}

# Kids and teams
${kidLines.join("\n") || "- (no kids on file)"}

# Upcoming events
${eventLines.join("\n") || "- (no events in the next week)"}${recentConversationSection}${pendingSection}

# Inbound message to classify

"${message}"

Classify this message. Emit exactly one call to the classify_parent_message tool.`;
}

function clamp01(n: number): number {
  if (isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
