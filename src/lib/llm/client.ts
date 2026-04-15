import Anthropic from "@anthropic-ai/sdk";

/**
 * Anthropic client singleton for the bot intent classifier.
 *
 * Lazy-loaded so importing this module doesn't fail at startup when the API
 * key is missing (e.g., in CI or local dev without Anthropic access). Call
 * `isLlmConfigured()` first if you need to degrade gracefully.
 */

let _client: Anthropic | null = null;

export const DEFAULT_CLASSIFIER_MODEL = "claude-haiku-4-5";

export function isLlmConfigured(): boolean {
  return Boolean(import.meta.env.ANTHROPIC_API_KEY);
}

export function getAnthropicClient(): Anthropic {
  if (_client) return _client;

  const apiKey = import.meta.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "Anthropic not configured. Set ANTHROPIC_API_KEY to enable the bot classifier.",
    );
  }

  _client = new Anthropic({ apiKey });
  return _client;
}

export function getClassifierModel(): string {
  return import.meta.env.ANTHROPIC_CLASSIFIER_MODEL || DEFAULT_CLASSIFIER_MODEL;
}
