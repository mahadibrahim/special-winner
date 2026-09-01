/**
 * The waiver assent sentence — the exact words a signer agrees to.
 *
 * ONE source for both the WaiverCard UI (which renders the sentence next to
 * the signature box) and the self-serve waiver endpoint (which persists the
 * sentence onto the signed record, #398). For a liability document, the text
 * the person actually assented to is the thing that matters; splitting the
 * two sides invites drift where the record no longer says what the screen
 * said.
 *
 * Pure and dependency-free so the client bundle can import it.
 */
export type WaiverConsentVariant = "adult" | "guardian";

/** Guardian iff the signer signs on a minor's behalf (resolve-signer's
 *  isMinor is the authoritative signal). */
export function waiverConsentVariant(isMinor: boolean): WaiverConsentVariant {
  return isMinor ? "guardian" : "adult";
}

/**
 * The sentence shown beside the accept checkbox/signature. `playerName` is
 * required for the guardian variant — it names the minor the guardian is
 * signing for.
 */
export function waiverAssentSentence(
  variant: WaiverConsentVariant,
  playerName?: string,
): string {
  return variant === "guardian"
    ? `I am the parent or legal guardian of ${playerName ?? "the player"} and accept these terms on their behalf.`
    : "I have read and accept these terms.";
}

/**
 * The participant's display name for `waiverAssentSentence`'s `playerName`
 * param — `"First Last"`, trimmed. `undefined` unless BOTH parts are
 * present (never a lopsided single name or a stray leading/trailing
 * space); `waiverAssentSentence` falls back to "the player" for
 * `undefined`.
 *
 * Shared so every surface that renders and records the guardian sentence
 * for the SAME booking derives the name the same way — a rendered card
 * (SessionDetail's WaiverCard, fed by `GET /api/dropin/sessions/[id]`) and
 * the recorded consent text (`POST .../bookings/[id]/waiver`) that
 * disagreed on how to build the name could disagree on the sentence
 * itself, which is exactly what this module exists to prevent.
 */
export function formatParticipantName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): string | undefined {
  if (!firstName || !lastName) return undefined;
  return `${firstName} ${lastName}`.trim();
}
