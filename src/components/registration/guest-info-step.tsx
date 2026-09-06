"use client"

import { useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { SmsConsentCheckbox } from "@/components/sms/sms-consent-checkbox"
import { buildSigninRedirectHref } from "@/lib/auth/signin-redirect-href"

export type GuestRegistrationMode = "child" | "adult"

/** Per-field validation messages surfaced after a Continue attempt with
 *  missing/invalid fields. Keys cover both child and adult modes. */
export interface GuestFieldErrors {
  parentFirstName?: string
  parentLastName?: string
  parentEmail?: string
  childFirstName?: string
  childLastName?: string
  childBirthDate?: string
  adultBirthDate?: string
  /** Shown when Continue was attempted without checking the COPPA box
   *  (child mode only). */
  parentalConsent?: string
}

export interface GuestInfoStepProps {
  seasonId: string
  mode: GuestRegistrationMode
  onModeChange: (mode: GuestRegistrationMode) => void
  /**
   * When the season's audience is unambiguous (child-only or adult-only),
   * the wizard locks the mode and we hide the parent/adult radio entirely.
   * Set to null/undefined to expose the toggle (ambiguous audience).
   */
  lockedMode?: GuestRegistrationMode | null

  /**
   * v2 (adult-locked) minimal flow: render only first/last/email + the
   * sign-in link. DOB, gender, phone and the waiver are deferred to the
   * post-payment completion step, so this step is just "claim your spot".
   */
  minimal?: boolean

  // Shared parent / registrant fields
  parentFirstName: string
  parentLastName: string
  parentEmail: string
  parentPhone: string
  emailCollision: boolean
  isCheckingEmail: boolean
  onParentFirstNameChange: (v: string) => void
  onParentLastNameChange: (v: string) => void
  onParentEmailChange: (v: string) => void
  onParentPhoneChange: (v: string) => void

  // SMS opt-in (unchecked by default; optional — see SmsConsentCheckbox)
  smsConsent: boolean
  onSmsConsentChange: (v: boolean) => void

  // Child-mode fields
  childFirstName: string
  childLastName: string
  childBirthDate: string
  childGender: string
  onChildFirstNameChange: (v: string) => void
  onChildLastNameChange: (v: string) => void
  onChildBirthDateChange: (v: string) => void
  onChildGenderChange: (v: string) => void

  // Adult-mode extra fields
  adultBirthDate: string
  adultGender: string
  onAdultBirthDateChange: (v: string) => void
  onAdultGenderChange: (v: string) => void

  /**
   * Live age-eligibility message for the child's birth date (audit F1),
   * computed by the wizard from the season's age-group bounds. Unlike
   * `fieldErrors`, this renders as soon as an out-of-range DOB is entered —
   * it is NOT gated behind a failed Continue attempt — so the visitor sees
   * it immediately on change/blur. Null/undefined = in range or unknown.
   */
  childAgeError?: string | null

  /**
   * COPPA (audit finding F2): required parental-consent checkbox, rendered
   * only in child mode (never adult-self). Exact copy is fixed — see the
   * render below — do not paraphrase; it mirrors the guest-checkout API's
   * `parentalConsent: true` requirement.
   */
  parentalConsent: boolean
  onParentalConsentChange: (v: boolean) => void

  /** Set by the wizard after a failed Continue attempt; null/absent = no
   *  validation attempted yet (fields render without error styling). */
  fieldErrors?: GuestFieldErrors | null

  /**
   * Fired when the visitor taps "Sign in". The wizard uses this to stash the
   * adult-self draft (v2 flow only — see registration-wizard.tsx) before the
   * anchor's normal navigation to /signin proceeds. Synchronous — no
   * preventDefault needed, sessionStorage.setItem completes before the
   * browser follows the href.
   */
  onSignInClick?: () => void
}

export function GuestInfoStep({
  seasonId,
  mode,
  onModeChange,
  parentFirstName,
  parentLastName,
  parentEmail,
  parentPhone,
  emailCollision,
  isCheckingEmail,
  onParentFirstNameChange,
  onParentLastNameChange,
  onParentEmailChange,
  onParentPhoneChange,
  smsConsent,
  onSmsConsentChange,
  childFirstName,
  childLastName,
  childBirthDate,
  childGender,
  onChildFirstNameChange,
  onChildLastNameChange,
  onChildBirthDateChange,
  onChildGenderChange,
  adultBirthDate,
  adultGender,
  onAdultBirthDateChange,
  onAdultGenderChange,
  childAgeError = null,
  parentalConsent,
  onParentalConsentChange,
  lockedMode,
  minimal = false,
  fieldErrors = null,
  onSignInClick,
}: GuestInfoStepProps) {
  const showModeToggle = !lockedMode && !minimal

  // Sign-in link href: carries the full current path + query string so
  // magic-link redemption lands back on this exact page (mode/audience
  // hints included), not a bare `/register/{seasonId}`. Computed
  // render-safely — SSR has no `window`, so the initial render falls back
  // to the path-only href and upgrades to the full href once mounted (a
  // stale-then-correct href across hydration is acceptable; reading
  // `window` during SSR is not).
  const [signInHref, setSignInHref] = useState(() =>
    buildSigninRedirectHref(`/register/${seasonId}`),
  )
  useEffect(() => {
    setSignInHref(
      buildSigninRedirectHref(window.location.pathname, window.location.search),
    )
  }, [])

  const err = (key: keyof GuestFieldErrors) => fieldErrors?.[key] ?? null
  const errText = (key: keyof GuestFieldErrors) => {
    const msg = err(key)
    return msg ? <p className="text-xs text-destructive">{msg}</p> : null
  }
  const errClass = (key: keyof GuestFieldErrors) =>
    err(key) ? "border-destructive" : "border-border"
  return (
    <div className="space-y-6">
      {minimal ? (
        /* ── v2 MINIMAL: claim your spot (name + email only) ── */
        <>
          <div>
            <h3 className="text-lg font-semibold text-ink mb-2">Claim your spot</h3>
            <p className="text-ink-muted text-sm">
              Pay to hold your spot — waiver and details come after.
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="guest-parent-first" className="text-ink-muted">First name *</Label>
                <Input
                  id="guest-parent-first"
                  autoComplete="given-name"
                  autoCapitalize="words"
                  enterKeyHint="next"
                  value={parentFirstName}
                  onChange={(e) => onParentFirstNameChange(e.target.value)}
                  className={`bg-cream-2 text-ink focus:border-primary ${errClass("parentFirstName")}`}
                />
                {errText("parentFirstName")}
              </div>
              <div className="space-y-2">
                <Label htmlFor="guest-parent-last" className="text-ink-muted">Last name *</Label>
                <Input
                  id="guest-parent-last"
                  autoComplete="family-name"
                  autoCapitalize="words"
                  enterKeyHint="next"
                  value={parentLastName}
                  onChange={(e) => onParentLastNameChange(e.target.value)}
                  className={`bg-cream-2 text-ink focus:border-primary ${errClass("parentLastName")}`}
                />
                {errText("parentLastName")}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-parent-email" className="text-ink-muted">Email *</Label>
              <Input
                id="guest-parent-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                enterKeyHint="done"
                value={parentEmail}
                onChange={(e) => onParentEmailChange(e.target.value)}
                className={`bg-cream-2 text-ink focus:border-primary ${errClass("parentEmail")}`}
              />
              {errText("parentEmail")}
              {emailCollision && (
                <p className="text-xs text-ink-muted">
                  We already have an account with this email. After payment we'll
                  send a sign-in link to{" "}
                  <span className="font-medium">{parentEmail}</span>.
                </p>
              )}
              {isCheckingEmail && !emailCollision && (
                <p className="text-xs text-ink-faint">Checking…</p>
              )}
            </div>
          </div>
        </>
      ) : (
      <>
      {/* Mode toggle — only shown when the season's audience is ambiguous */}
      {showModeToggle && (
        <div>
          <p className="text-sm font-medium text-ink mb-3">Who is registering?</p>
          <RadioGroup
            value={mode}
            onValueChange={(v) => onModeChange(v as GuestRegistrationMode)}
            className="grid gap-2"
          >
            <label
              htmlFor="mode-child"
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
                mode === "child"
                  ? "border-primary bg-primary/5"
                  : "border-border bg-cream-2 hover:border-primary/40"
              }`}
            >
              <RadioGroupItem id="mode-child" value="child" />
              <span className="text-sm text-ink">A parent registering their child</span>
            </label>
            <label
              htmlFor="mode-adult"
              className={`flex items-center gap-3 rounded-xl border px-4 py-3 cursor-pointer transition-colors ${
                mode === "adult"
                  ? "border-primary bg-primary/5"
                  : "border-border bg-cream-2 hover:border-primary/40"
              }`}
            >
              <RadioGroupItem id="mode-adult" value="adult" />
              <span className="text-sm text-ink">An adult registering themselves</span>
            </label>
          </RadioGroup>
        </div>
      )}

      {mode === "child" ? (
        /* ── CHILD MODE: preserve existing parent + child form byte-for-byte ── */
        <>
          <div>
            <p className="text-ink-muted text-sm">
              No account or password needed — just the basics below. After
              payment we'll email you a one-tap link to manage your
              registration.
            </p>
          </div>

          <div className="space-y-4">
            <h4 className="font-medium text-ink">About you</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="guest-parent-first" className="text-ink-muted">First name *</Label>
                <Input
                  id="guest-parent-first"
                  autoComplete="given-name"
                  autoCapitalize="words"
                  enterKeyHint="next"
                  value={parentFirstName}
                  onChange={(e) => onParentFirstNameChange(e.target.value)}
                  className={`bg-cream-2 text-ink focus:border-primary ${errClass("parentFirstName")}`}
                />
                {errText("parentFirstName")}
              </div>
              <div className="space-y-2">
                <Label htmlFor="guest-parent-last" className="text-ink-muted">Last name *</Label>
                <Input
                  id="guest-parent-last"
                  autoComplete="family-name"
                  autoCapitalize="words"
                  enterKeyHint="next"
                  value={parentLastName}
                  onChange={(e) => onParentLastNameChange(e.target.value)}
                  className={`bg-cream-2 text-ink focus:border-primary ${errClass("parentLastName")}`}
                />
                {errText("parentLastName")}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-parent-email" className="text-ink-muted">Email *</Label>
              <Input
                id="guest-parent-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                enterKeyHint="next"
                value={parentEmail}
                onChange={(e) => onParentEmailChange(e.target.value)}
                className={`bg-cream-2 text-ink focus:border-primary ${errClass("parentEmail")}`}
              />
              {errText("parentEmail")}
              {emailCollision && (
                <p className="text-xs text-ink-muted">
                  We already have an account with this email. After payment we'll
                  send a sign-in link to{" "}
                  <span className="font-medium">{parentEmail}</span>.
                </p>
              )}
              {isCheckingEmail && !emailCollision && (
                <p className="text-xs text-ink-faint">Checking…</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-parent-phone" className="text-ink-muted">Phone (optional)</Label>
              <Input
                id="guest-parent-phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                enterKeyHint="next"
                value={parentPhone}
                onChange={(e) => onParentPhoneChange(e.target.value)}
                className="bg-cream-2 border-border text-ink focus:border-primary"
              />
              <SmsConsentCheckbox
                id="sms-consent-guest-child"
                checked={smsConsent}
                onCheckedChange={onSmsConsentChange}
                className="mt-1.5"
              />
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-border">
            <h4 className="font-medium text-ink">Player</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="guest-child-first" className="text-ink-muted">First name *</Label>
                <Input
                  id="guest-child-first"
                  autoCapitalize="words"
                  enterKeyHint="next"
                  value={childFirstName}
                  onChange={(e) => onChildFirstNameChange(e.target.value)}
                  className={`bg-cream-2 text-ink focus:border-primary ${errClass("childFirstName")}`}
                />
                {errText("childFirstName")}
              </div>
              <div className="space-y-2">
                <Label htmlFor="guest-child-last" className="text-ink-muted">Last name *</Label>
                <Input
                  id="guest-child-last"
                  autoCapitalize="words"
                  enterKeyHint="next"
                  value={childLastName}
                  onChange={(e) => onChildLastNameChange(e.target.value)}
                  className={`bg-cream-2 text-ink focus:border-primary ${errClass("childLastName")}`}
                />
                {errText("childLastName")}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="guest-child-birthdate" className="text-ink-muted">Birth date *</Label>
                <Input
                  id="guest-child-birthdate"
                  type="date"
                  value={childBirthDate}
                  onChange={(e) => onChildBirthDateChange(e.target.value)}
                  className={`bg-cream-2 text-ink focus:border-primary ${
                    childAgeError ? "border-destructive" : errClass("childBirthDate")
                  }`}
                />
                {errText("childBirthDate")}
                {childAgeError && (
                  <p className="text-xs text-destructive">{childAgeError}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="guest-child-gender" className="text-ink-muted">Gender</Label>
                <Select value={childGender} onValueChange={onChildGenderChange}>
                  <SelectTrigger id="guest-child-gender" className="bg-cream-2 border-border text-ink">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent className="bg-cream border-border">
                    <SelectItem value="male" className="text-ink-2">Male</SelectItem>
                    <SelectItem value="female" className="text-ink-2">Female</SelectItem>
                    <SelectItem value="other" className="text-ink-2">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* COPPA (audit finding F2): verifiable parental consent captured
                at collection time, separate from the (deferred) liability
                waiver. Required for every parent+child guest checkout —
                gates the guest-checkout API's `parentalConsent: true`. */}
            <div className="rounded-lg border border-border bg-cream-2 p-3">
              <label
                htmlFor="guest-child-parental-consent"
                className="flex items-start gap-2.5 cursor-pointer"
              >
                <Checkbox
                  id="guest-child-parental-consent"
                  checked={parentalConsent}
                  onCheckedChange={(v) => onParentalConsentChange(v === true)}
                  className="mt-0.5"
                />
                <span className="text-sm text-ink-2">
                  I am this child's parent or legal guardian and I consent to
                  Aspire collecting their information for this program.
                  Required by federal law (COPPA) for participants under 13.
                </span>
              </label>
              {err("parentalConsent") && (
                <p className="text-xs text-destructive mt-1.5 ml-[26px]">
                  {err("parentalConsent")}
                </p>
              )}
            </div>
          </div>
        </>
      ) : (
        /* ── ADULT MODE: single registrant form ── */
        <>
          <div>
            <h3 className="text-lg font-semibold text-ink mb-2">Registrant info</h3>
            <p className="text-ink-muted text-sm">
              No account or password needed — just the basics below. After
              payment we'll email you a one-tap link to manage your
              registration.
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="guest-parent-first" className="text-ink-muted">First name *</Label>
                <Input
                  id="guest-parent-first"
                  autoComplete="given-name"
                  autoCapitalize="words"
                  enterKeyHint="next"
                  value={parentFirstName}
                  onChange={(e) => onParentFirstNameChange(e.target.value)}
                  className={`bg-cream-2 text-ink focus:border-primary ${errClass("parentFirstName")}`}
                />
                {errText("parentFirstName")}
              </div>
              <div className="space-y-2">
                <Label htmlFor="guest-parent-last" className="text-ink-muted">Last name *</Label>
                <Input
                  id="guest-parent-last"
                  autoComplete="family-name"
                  autoCapitalize="words"
                  enterKeyHint="next"
                  value={parentLastName}
                  onChange={(e) => onParentLastNameChange(e.target.value)}
                  className={`bg-cream-2 text-ink focus:border-primary ${errClass("parentLastName")}`}
                />
                {errText("parentLastName")}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-parent-email" className="text-ink-muted">Email *</Label>
              <Input
                id="guest-parent-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                enterKeyHint="next"
                value={parentEmail}
                onChange={(e) => onParentEmailChange(e.target.value)}
                className={`bg-cream-2 text-ink focus:border-primary ${errClass("parentEmail")}`}
              />
              {errText("parentEmail")}
              {emailCollision && (
                <p className="text-xs text-ink-muted">
                  We already have an account with this email. After payment we'll
                  send a sign-in link to{" "}
                  <span className="font-medium">{parentEmail}</span>.
                </p>
              )}
              {isCheckingEmail && !emailCollision && (
                <p className="text-xs text-ink-faint">Checking…</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-parent-phone" className="text-ink-muted">Phone (optional)</Label>
              <Input
                id="guest-parent-phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                enterKeyHint="next"
                value={parentPhone}
                onChange={(e) => onParentPhoneChange(e.target.value)}
                className="bg-cream-2 border-border text-ink focus:border-primary"
              />
              <SmsConsentCheckbox
                id="sms-consent-guest-adult"
                checked={smsConsent}
                onCheckedChange={onSmsConsentChange}
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="guest-adult-birthdate" className="text-ink-muted">Birth date *</Label>
                <Input
                  id="guest-adult-birthdate"
                  type="date"
                  autoComplete="bday"
                  value={adultBirthDate}
                  onChange={(e) => onAdultBirthDateChange(e.target.value)}
                  className={`bg-cream-2 text-ink focus:border-primary ${errClass("adultBirthDate")}`}
                />
                {errText("adultBirthDate")}
              </div>
              <div className="space-y-2">
                <Label htmlFor="guest-adult-gender" className="text-ink-muted">Gender (optional)</Label>
                <Select value={adultGender} onValueChange={onAdultGenderChange}>
                  <SelectTrigger id="guest-adult-gender" className="bg-cream-2 border-border text-ink">
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent className="bg-cream border-border">
                    <SelectItem value="male" className="text-ink-2">Male</SelectItem>
                    <SelectItem value="female" className="text-ink-2">Female</SelectItem>
                    <SelectItem value="other" className="text-ink-2">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        </>
      )}
      </>
      )}

      <p className="text-xs text-ink-muted">
        Already have an account?{" "}
        <a
          href={signInHref}
          onClick={() => onSignInClick?.()}
          className="text-primary hover:text-primary/80 font-medium"
        >
          Sign in
        </a>
      </p>
    </div>
  )
}
