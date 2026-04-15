/**
 * Bot action type definitions.
 *
 * Every bot action implements this interface and is registered in
 * src/lib/bot/actions/registry.ts. Actions are invoked by the inbound
 * pipeline when the classifier emits `action: 'bot_execute'`.
 */

export interface BotActionContext {
  /** The parent user whose behalf the action runs on. */
  parentUserId: string;
  /** The org-scope. All action logic is tenant-scoped. */
  organizationId: string;
  /** The conversation this action is part of (for logging). */
  conversationId: string;
  /** The inbound message that triggered this action (for logging). */
  triggeringMessageId?: string;
}

export type BotActionResult =
  | {
      ok: true;
      /** Short natural-language response to send back to the parent. */
      responseBody: string;
      /** Optional structured metadata the caller may log. */
      details?: Record<string, unknown>;
    }
  | {
      ok: false;
      /** Short response body explaining the problem (delivered to parent). */
      responseBody: string;
      /** Internal error reason (logged, not shown to parent). */
      errorReason: string;
      /** If true, suggest routing to a human instead. */
      suggestEscalation?: boolean;
    };

export interface BotActionDefinition {
  /** Stable identifier used by the classifier. */
  name: string;
  /** Natural-language description used in the LLM system prompt. */
  description: string;
  /** Whether this action mutates state. Read-only actions skip confirmation flows. */
  readOnly: boolean;
  /** Whether a mutation can be reversed via admin reversal UI. */
  reversible: boolean;
  /** Whether this action requires an explicit parent confirmation before executing. */
  requiresConfirmation: boolean;
  /**
   * Handler function. Must be idempotent on logical params — if called twice
   * with the same params, the second call should either no-op or return the
   * same success response.
   */
  handler: (
    params: Record<string, unknown>,
    context: BotActionContext,
  ) => Promise<BotActionResult>;
}
