/**
 * The single source of the opt-in copy shown to customers.
 *
 * It lives here, not in the component, because the exact text displayed must be
 * STORED with each consent record: a carrier reviewer asks to see the live
 * opt-in form and compares it against the consent evidence. If the component
 * rendered one sentence and we stored another, the evidence is worthless.
 *
 * None of this copy may frame consent as a condition of entry — the waiver is
 * the condition of entry, and consent obtained as a condition of something else
 * is not consent.
 */
export const CONSENT_CHANNELS = ["email", "sms", "whatsapp"] as const;
export type ConsentChannel = (typeof CONSENT_CHANNELS)[number];

export const CONSENT_COPY: Record<ConsentChannel, string> = {
  email:
    "Email me about sessions, leagues and offers. I can unsubscribe any time.",
  sms:
    "Text me about sessions, leagues and offers. Message and data rates may apply. Reply STOP to opt out.",
  whatsapp:
    "Message me on WhatsApp about sessions, leagues and offers. I can opt out any time.",
};
