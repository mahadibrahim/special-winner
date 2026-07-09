/**
 * SmsConsentDisclosure — the single source of truth for our 10DLC SMS opt-in
 * language. Rendered next to every phone-number field where a user provides
 * their number, so consent is captured at the point of collection.
 *
 * Carriers (Telnyx 10DLC review) require the opt-in surface to state, alongside
 * the phone field: who sends the messages, message types, that consent is
 * given, message frequency, that message & data rates may apply, the STOP and
 * HELP keywords, and links to the Privacy Policy and Terms. Keep this copy in
 * sync with the SMS program described in the carrier campaign registration.
 */
export function SmsConsentDisclosure({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs leading-relaxed text-ink-faint ${className}`}>
      By providing your phone number, you agree to receive recurring automated
      text messages from <span className="font-medium">Aspire Sports</span> —
      schedule updates, cancellations, reminders, and coach messages — at the
      number provided. Consent is not a condition of registration. Msg frequency
      varies. Msg &amp; data rates may apply. Reply <span className="font-medium">STOP</span>{" "}
      to opt out, <span className="font-medium">HELP</span> for help. See our{" "}
      <a href="/privacy" className="underline hover:text-ink-muted">Privacy Policy</a>{" "}
      and{" "}
      <a href="/terms" className="underline hover:text-ink-muted">Terms of Service</a>.
    </p>
  )
}
