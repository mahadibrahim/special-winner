/**
 * The drop-in liability waiver text — single source for every surface that
 * captures a drop-in waiver signature. Since the sign-before-you-PLAY change
 * the waiver is captured AFTER payment (session-page success card, dashboard
 * CTA, email link), never as a pre-payment gate; the kiosk/walk-up flows
 * capture it at check-in. Keep this text in sync with nothing — this IS the
 * source.
 */
export const DROPIN_WAIVER_TEXT =
  "I understand that participating in drop-in sports sessions involves physical activity and inherent risk of injury. I voluntarily assume all risks associated with participation and release Aspire Sports, its partners, and staff from liability for any injury, loss, or damage arising from my participation. I confirm that I am physically fit to participate and have no medical conditions that would prevent safe participation.";

/**
 * The assent line beside the accept checkbox — the sentence the signer
 * actually ticks. Shared with `POST /api/dropin/bookings/[id]/waiver`, which
 * persists it onto the consent record: for a liability document, what the
 * person assented to is the thing that matters, and a record quoting words
 * the screen never showed is worse than no record at all. (Same principle as
 * `src/lib/consents/waiver-consent-language.ts`, which owns the self-serve
 * kiosk's adult/guardian sentences.)
 */
export const DROPIN_WAIVER_ACCEPT_LABEL = "I accept the waiver above";
