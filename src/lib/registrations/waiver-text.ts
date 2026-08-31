/**
 * The assent line beside the registration waiver's accept checkbox — the
 * sentence the signer actually ticks in the pre-payment wizard step
 * (`components/registration/waiver-step.tsx`) and in the post-payment
 * completion form (`components/registration/completion-form.tsx`).
 *
 * Shared with the server so the `consents` row records what the screen
 * showed: for a liability release, what the person assented to is the thing
 * that matters, and a record quoting words the screen never showed is worse
 * than no record at all. Same principle (and same shape) as
 * `DROPIN_WAIVER_ACCEPT_LABEL` in `src/lib/dropin/waiver-text.ts` and the
 * self-serve kiosk sentences in `src/lib/consents/waiver-consent-language.ts`.
 *
 * The waiver BODY lives in `components/registration/waiver-text.tsx` (one
 * component, rendered by both screens) — this is only the assent line.
 */
export const REGISTRATION_WAIVER_ACCEPT_LABEL = "I agree to the terms above.";
