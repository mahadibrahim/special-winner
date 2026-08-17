"use client"

import { useEffect, useState } from "react"
import { CheckCircle2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ErrorBanner } from "@/components/ui/error-banner"
import { SmsConsentCheckbox } from "@/components/sms/sms-consent-checkbox"
import { WhatsAppConsentCheckbox } from "@/components/consents/whatsapp-consent-checkbox"
import { WaiverText } from "./waiver-text"
import { MediaAuthStep, type MediaAuthScope } from "./media-auth-step"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { parseApiError } from "@/lib/api/error-message"
import { trackRegistrationStepViewed, type RegFlow } from "@/lib/analytics/events"

export interface CompletionFormProps {
  registrationId: string
  seasonId: string
  /** True when the family member's birthDate is still null — the v2
   *  minimal guest flow never collects it up front. */
  needsBirthDate: boolean
  /** Where this form is mounted — feeds the `?via=` param the completion
   *  endpoint reads for analytics/attribution. */
  via: "confirm_screen" | "email_link"
  /** True when the registrant is the account owner (adult self path), for
   *  the media-authorization copy. Defaults to false (dependent). */
  isSelf?: boolean
  /** Display name of the participant, for media-authorization copy. Falls
   *  back to generic phrasing when omitted. */
  participantName?: string
  /** Flow classification for the completion-step analytics event
   *  (solo/team_captain/team_member). Defaults to "solo" — the right value
   *  for the `/account/complete/[registrationId]` resume page, which has no
   *  way to know the original registration's flow. Wizard call sites should
   *  pass their own computed flow instead of relying on the default. */
  flow?: RegFlow
}

/**
 * Composes 3 plain-text MM/DD/YYYY fields into an ISO "YYYY-MM-DD" string,
 * validating that the date actually exists (rejects e.g. 02/30). Returns
 * null when any field is missing, out of range, or the composed date is
 * impossible.
 */
function composeBirthDateIso(month: string, day: string, year: string): string | null {
  if (!month || !day || !year) return null
  const m = Number(month)
  const d = Number(day)
  const y = Number(year)
  if (!Number.isInteger(m) || m < 1 || m > 12) return null
  if (!Number.isInteger(d) || d < 1 || d > 31) return null
  const currentYear = new Date().getUTCFullYear()
  if (!Number.isInteger(y) || y < currentYear - 120 || y > currentYear) return null

  const mm = String(m).padStart(2, "0")
  const dd = String(d).padStart(2, "0")
  const iso = `${y}-${mm}-${dd}`

  // Round-trip through Date.UTC to reject impossible combos (e.g. Feb 30
  // silently rolling over to Mar 2).
  const check = new Date(`${iso}T00:00:00Z`)
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() + 1 !== m ||
    check.getUTCDate() !== d
  ) {
    return null
  }
  return iso
}

const digitsOnly = (v: string, maxLength: number) => v.replace(/\D/g, "").slice(0, maxLength)

/**
 * Post-payment completion form: signs the waiver and backfills whatever the
 * v2 minimal flow deferred (birth date, phone) after a season has already
 * been paid for. Rendered inline on the confirm screen (`via="confirm_screen"`)
 * and as the top-level island of the `/account/complete/[registrationId]`
 * resume page reached from the reminder email (`via="email_link"`).
 */
export function CompletionForm({
  registrationId,
  seasonId,
  needsBirthDate,
  via,
  isSelf = false,
  participantName = "",
  flow = "solo",
}: CompletionFormProps) {
  // Top-level island on the resume page; a harmless extra beacon set when
  // embedded inside the wizard (which already fires its own).
  useHydrationBeacon()

  const [waiverAccepted, setWaiverAccepted] = useState(false)
  const [waiverSignature, setWaiverSignature] = useState("")
  const [dobMonth, setDobMonth] = useState("")
  const [dobDay, setDobDay] = useState("")
  const [dobYear, setDobYear] = useState("")
  const [phone, setPhone] = useState("")
  const [smsConsent, setSmsConsent] = useState(false)
  // Separate state, not derived from smsConsent — the two are distinct
  // consents and one must never imply the other. Both start unchecked.
  const [whatsappConsent, setWhatsappConsent] = useState(false)
  // Opt-out media consent: empty set = all 3 scopes granted by default,
  // matching v1's default. Opt-outs are never pre-checked.
  const [mediaAuthOptOuts, setMediaAuthOptOuts] = useState<ReadonlySet<MediaAuthScope>>(
    new Set(),
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    trackRegistrationStepViewed({
      step: "completion",
      seasonId,
      flow,
      variant: "v2",
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSubmit = async () => {
    setError(null)

    if (!waiverAccepted) {
      setError("Please confirm you agree to the waiver terms.")
      return
    }
    if (waiverSignature.trim().length < 2) {
      setError("Please type your full legal name as your signature.")
      return
    }

    let birthDate: string | undefined
    if (needsBirthDate) {
      const iso = composeBirthDateIso(dobMonth, dobDay, dobYear)
      if (!iso) {
        setError("Please enter a valid birth date.")
        return
      }
      birthDate = iso
    }

    const trimmedPhone = phone.trim()

    setIsSubmitting(true)
    try {
      const res = await fetch(
        `/api/registrations/${registrationId}/complete?via=${via}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            waiverAccepted: true,
            waiverSignature: waiverSignature.trim(),
            birthDate,
            phone: trimmedPhone || undefined,
            smsConsent: trimmedPhone ? smsConsent : undefined,
            // Marketing consent for WhatsApp — a separate legal consent from
            // smsConsent above, never inferred from it. Only meaningful when a
            // number was actually provided.
            whatsappConsent: trimmedPhone ? whatsappConsent : undefined,
            mediaAuthOptOuts: Array.from(mediaAuthOptOuts),
          }),
        },
      )
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(parseApiError(data, "Failed to complete your registration"))
      }
      // Both { signed: true, ... } and { alreadySigned: true } are success —
      // the latter just means a previous submit already went through.
      setSuccess(true)
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to complete your registration"
      toast.error(message)
      setError(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="text-center py-6">
        <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-3">
          <CheckCircle2 className="w-7 h-7 text-green-500" />
        </div>
        <h3 className="text-lg font-semibold text-ink mb-1">You're all set for game 1.</h3>
        <p className="text-ink-muted text-sm">
          Your waiver is signed and your details are saved.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <WaiverText />

      {needsBirthDate && (
        <div className="space-y-2">
          <Label className="text-ink-muted">Birth Date *</Label>
          <div className="grid grid-cols-3 gap-3">
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="bday-month"
              aria-label="Birth month"
              placeholder="MM"
              maxLength={2}
              value={dobMonth}
              onChange={(e) => setDobMonth(digitsOnly(e.target.value, 2))}
              className="bg-cream-2 border-border text-ink focus:border-primary placeholder:text-ink-faint text-center ph-mask"
            />
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="bday-day"
              aria-label="Birth day"
              placeholder="DD"
              maxLength={2}
              value={dobDay}
              onChange={(e) => setDobDay(digitsOnly(e.target.value, 2))}
              className="bg-cream-2 border-border text-ink focus:border-primary placeholder:text-ink-faint text-center ph-mask"
            />
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="bday-year"
              aria-label="Birth year"
              placeholder="YYYY"
              maxLength={4}
              value={dobYear}
              onChange={(e) => setDobYear(digitsOnly(e.target.value, 4))}
              className="bg-cream-2 border-border text-ink focus:border-primary placeholder:text-ink-faint text-center ph-mask"
            />
          </div>
        </div>
      )}

      <div className="flex items-start gap-3">
        <Checkbox
          id="completion-waiver-accept"
          checked={waiverAccepted}
          onCheckedChange={(checked) => setWaiverAccepted(checked === true)}
          className="mt-1 border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
        />
        <Label htmlFor="completion-waiver-accept" className="text-sm text-ink-2 cursor-pointer">
          I agree to the terms above.
        </Label>
      </div>

      <div className="space-y-2">
        <Label className="text-ink-muted">Digital Signature *</Label>
        <Input
          value={waiverSignature}
          onChange={(e) => setWaiverSignature(e.target.value)}
          placeholder="Type your full legal name"
          className="bg-cream-2 border-border text-ink focus:border-primary placeholder:text-ink-faint"
        />
        <p className="text-xs text-ink-muted">
          By typing your name above, you agree that this constitutes a legal signature.
        </p>
      </div>

      <details open className="group">
        <summary className="text-sm font-medium text-ink cursor-pointer select-none">
          Photo &amp; video permissions
        </summary>
        <div className="mt-3">
          <MediaAuthStep
            isSelf={isSelf}
            participantName={participantName}
            optOutScopes={mediaAuthOptOuts}
            onOptOutScopesChange={setMediaAuthOptOuts}
          />
        </div>
      </details>

      <div className="space-y-2">
        <Label className="text-ink-muted">Phone (optional)</Label>
        <Input
          type="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(555) 123-4567"
          className="bg-cream-2 border-border text-ink focus:border-primary placeholder:text-ink-faint"
        />
        <SmsConsentCheckbox
          checked={smsConsent}
          onCheckedChange={setSmsConsent}
          id="completion-sms-consent"
        />
        {/* pt-2 on top of the container's space-y-2: two dense fine-print
            blocks 8px apart read as one consent, and these are two separate
            ones the customer must be able to accept independently. */}
        <WhatsAppConsentCheckbox
          checked={whatsappConsent}
          onCheckedChange={setWhatsappConsent}
          id="completion-whatsapp-consent"
          className="pt-2"
        />
      </div>

      <Button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="w-full bg-primary hover:bg-primary/90"
      >
        {isSubmitting ? "Saving…" : "Sign & Finish"}
      </Button>
    </div>
  )
}
