"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { CONSENT_COPY } from "@/lib/consents/marketing-channels"

/**
 * WhatsAppConsentCheckbox — marketing opt-in capture for WhatsApp.
 *
 * DELIBERATELY NOT a variant of SmsConsentCheckbox. The two capture legally
 * distinct consents and must never be merged or implied from one another:
 *
 *   • SmsConsentCheckbox  — OPERATIONAL SMS under TCPA/10DLC. Schedule
 *     updates, cancellations, reminders, coach messages. Carrier-reviewed.
 *   • this component      — MARKETING messaging under Meta's WhatsApp policy.
 *     Sessions, leagues and offers.
 *
 * `phone_opt_ins.channel` encodes the same split at the storage layer: a
 * single status per (org, phone) "cannot honestly represent 'yes to SMS, no
 * to WhatsApp'". Ticking one box must never write the other's row.
 *
 * The label renders CONSENT_COPY.whatsapp VERBATIM and the caller stores that
 * same constant as `consentTextShown`. That equality is the entire point: a
 * reviewer compares the live form against the stored evidence, and if the
 * component rendered one sentence while we stored another the evidence proves
 * nothing. Never inline the sentence here — import it.
 *
 * Unchecked by default and optional, for the same reason the SMS box is:
 * consent obtained as a condition of registration is not consent.
 *
 * Controlled component — the parent owns the boolean and threads it to the
 * endpoint that calls recordMarketingConsent({ channel: "whatsapp" }).
 */
export function WhatsAppConsentCheckbox({
  checked,
  onCheckedChange,
  id = "whatsapp-consent",
  className = "",
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  /** Override when two instances could mount in one document. */
  id?: string
  className?: string
}) {
  return (
    <div className={`flex items-start gap-2.5 ${className}`}>
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        className="mt-0.5"
      />
      <div className="space-y-1">
        <label htmlFor={id} className="block text-sm text-ink cursor-pointer">
          {CONSENT_COPY.whatsapp}
        </label>
        <p className="text-xs leading-relaxed text-ink-faint">
          Sent by <span className="font-medium">Aspire Sports</span> on WhatsApp
          to the number above. Separate from the text-message consent above, and
          not a condition of registration. See our{" "}
          <a href="/privacy" className="underline hover:text-ink-muted">Privacy Policy</a>{" "}
          and{" "}
          <a href="/terms" className="underline hover:text-ink-muted">Terms of Service</a>.
        </p>
      </div>
    </div>
  )
}
