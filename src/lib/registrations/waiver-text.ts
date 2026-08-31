/**
 * What the registration waiver screens actually put in front of a signer —
 * one source, shared by the screens that render it and the servers that
 * persist it onto the `consents` row.
 *
 * For a liability release, the text the person assented to is the thing that
 * matters: a record quoting words the screen never showed is worse than no
 * record at all. That is the same principle behind
 * `DROPIN_WAIVER_ACCEPT_LABEL` (src/lib/dropin/waiver-text.ts) and the
 * self-serve kiosk's `waiverAssentSentence`
 * (src/lib/consents/waiver-consent-language.ts).
 *
 * The two registration screens do NOT show the same words, and neither shows
 * the same words to an adult registrant and to a guardian signing for a child.
 * Hence a composer per screen rather than one flat sentence — recording the
 * adult label against a guardian signature was the drift this module exists to
 * close.
 *
 * The waiver BODY (assumption of risk, medical authorization, …) lives in
 * `components/registration/waiver-text.tsx` — one component rendered by both
 * screens. This module owns only the assent lines wrapped around it.
 *
 * Pure and dependency-free so the client bundle can import it.
 */
import {
  waiverAssentSentence,
  type WaiverConsentVariant,
} from "@/lib/consents/waiver-consent-language";

/** The generic assent line beside the accept checkbox on both screens. */
export const REGISTRATION_WAIVER_ACCEPT_LABEL = "I agree to the terms above.";

/**
 * Format an annual waiver's expiry for the "waiver on file — valid through …"
 * note. Accepts a Date, an ISO string (what the create endpoints return), or
 * null/undefined, and returns null when there is nothing to show — a covered
 * participant whose coverage comes from a legacy signature has no consents row
 * and therefore no date. Callers must render date-free copy for null; it is
 * never a "not covered" signal.
 *
 * UTC on purpose: `consents.expiresAt` is stored in UTC like every timestamp
 * here, and a viewer's local midnight must not shift the printed day.
 */
export function formatWaiverValidUntil(
  value: Date | string | null | undefined,
): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * A sentence split around the participant's name, so the screen can bold the
 * name (`{before}<strong>{name}</strong>{after}`) while the server records the
 * identical plain string. Interpolating the name into JSX and *separately*
 * re-typing the sentence server-side is exactly how the record and the screen
 * drift apart.
 */
export interface NamedSentenceParts {
  before: string;
  after: string;
}

function joinParts(parts: NamedSentenceParts, name: string): string {
  return `${parts.before}${name}${parts.after}`;
}

// ---------------------------------------------------------------------------
// Pre-payment wizard — components/registration/waiver-step.tsx
// ---------------------------------------------------------------------------

/**
 * The branched body paragraph above the checkbox. The wizard shows one of
 * these to an adult registrant and to an authed guardian; the guest+child
 * path shows none (its checkbox label carries the child's name instead).
 */
export function wizardWaiverBodyParts(
  variant: WaiverConsentVariant,
): NamedSentenceParts {
  return variant === "adult"
    ? {
        before: "I, ",
        after:
          ", agree to participate in this program and accept the terms of the participation waiver.",
      }
    : {
        before: "I authorize ",
        after:
          " to participate in this program on my behalf as their parent or legal guardian, and accept the terms of the participation waiver.",
      };
}

/** The guest+child checkbox label — names the child inline. */
export function guestChildWaiverLabelParts(): NamedSentenceParts {
  return {
    before:
      "I have read, understand, and agree to the terms of this waiver on behalf of ",
    after: ".",
  };
}

/**
 * Everything the pre-payment wizard shows a signer beside the signature box,
 * as one plain string — body paragraph (when shown) followed by the checkbox
 * label. This is what `/api/registrations` and `/api/registrations/guest-checkout`
 * persist as the consent's `text=`.
 */
export function wizardWaiverAssentText(opts: {
  variant: WaiverConsentVariant;
  /** The name the screen interpolates: the registrant for the body sentence,
   *  the child for the guest+child label. */
  participantName: string;
  /** True only for the guest parent-registering-a-child path, which shows no
   *  body paragraph and names the child in the checkbox label instead. */
  isGuestChild?: boolean;
}): string {
  const name = opts.participantName.trim() || "the player";
  if (opts.isGuestChild) {
    return joinParts(guestChildWaiverLabelParts(), name);
  }
  return `${joinParts(wizardWaiverBodyParts(opts.variant), name)} ${REGISTRATION_WAIVER_ACCEPT_LABEL}`;
}

// ---------------------------------------------------------------------------
// Post-payment completion — components/registration/completion-form.tsx
// ---------------------------------------------------------------------------

/**
 * Everything the completion screen shows a signer: the generic accept label,
 * plus — for a dependent — the guardian attestation. That attestation IS
 * `waiverAssentSentence("guardian", …)`; the screen used to re-type it as a
 * template literal, which is the fork this import closes.
 */
export function completionWaiverAssentText(
  variant: WaiverConsentVariant,
  participantName?: string,
): string {
  if (variant === "adult") return REGISTRATION_WAIVER_ACCEPT_LABEL;
  return `${REGISTRATION_WAIVER_ACCEPT_LABEL} ${waiverAssentSentence("guardian", participantName)}`;
}

// ---------------------------------------------------------------------------
// Admin walk-up desk — pages/api/admin/walk-up-registration.ts
// ---------------------------------------------------------------------------

/**
 * The walk-up desk has NO customer-facing waiver screen: staff record that the
 * person accepted the waiver in person. There is therefore no rendered text to
 * quote, so the record carries the canonical assent sentence for the variant —
 * the substance the person agreed to — and the consent's `notes` disclose that
 * it was desk-captured (`walk-up: admin=<id>`) rather than typed by the signer.
 */
export function walkUpWaiverAssentText(
  variant: WaiverConsentVariant,
  participantName?: string,
): string {
  return waiverAssentSentence(variant, participantName);
}
