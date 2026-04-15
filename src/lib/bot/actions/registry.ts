import type { BotActionDefinition } from "./types";
import { lookupSchedule } from "./lookup-schedule";
import { switchPrimaryChannel } from "./switch-primary-channel";
import { rsvpAbsent, rsvpPresent } from "./rsvp";
import { faqResponse } from "./faq-response";

/**
 * Bot action registry.
 *
 * Add a new action by importing it and including it in the exported ACTIONS
 * object. The registry is the single source of truth for "what the bot is
 * allowed to do" — the classifier's LLM system prompt is built from this
 * registry's descriptions, the inbound pipeline only dispatches to actions
 * that exist here, and admin reversal UI only reverses actions tagged as
 * reversible here.
 *
 * Principle: the bot never invents new capabilities. If an action isn't in
 * this registry, it can't happen.
 */

export const ACTIONS: Record<string, BotActionDefinition> = {
  [lookupSchedule.name]: lookupSchedule,
  [switchPrimaryChannel.name]: switchPrimaryChannel,
  [rsvpAbsent.name]: rsvpAbsent,
  [rsvpPresent.name]: rsvpPresent,
  [faqResponse.name]: faqResponse,
};

export function getAction(name: string): BotActionDefinition | null {
  return ACTIONS[name] ?? null;
}

export function listActions(): BotActionDefinition[] {
  return Object.values(ACTIONS);
}
