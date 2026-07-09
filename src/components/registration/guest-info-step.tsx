"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { SmsConsentDisclosure } from "@/components/sms/sms-consent-disclosure"

export type GuestRegistrationMode = "child" | "adult"

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
  lockedMode,
}: GuestInfoStepProps) {
  const showModeToggle = !lockedMode
  return (
    <div className="space-y-6">
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
              We'll create an account for you and email a one-tap sign-in link after
              payment. No password needed.
            </p>
          </div>

          <div className="space-y-4">
            <h4 className="font-medium text-ink">About you</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="guest-parent-first" className="text-ink-muted">First name *</Label>
                <Input
                  id="guest-parent-first"
                  value={parentFirstName}
                  onChange={(e) => onParentFirstNameChange(e.target.value)}
                  className="bg-cream-2 border-border text-ink focus:border-primary"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="guest-parent-last" className="text-ink-muted">Last name *</Label>
                <Input
                  id="guest-parent-last"
                  value={parentLastName}
                  onChange={(e) => onParentLastNameChange(e.target.value)}
                  className="bg-cream-2 border-border text-ink focus:border-primary"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-parent-email" className="text-ink-muted">Email *</Label>
              <Input
                id="guest-parent-email"
                type="email"
                value={parentEmail}
                onChange={(e) => onParentEmailChange(e.target.value)}
                className="bg-cream-2 border-border text-ink focus:border-primary"
              />
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
                value={parentPhone}
                onChange={(e) => onParentPhoneChange(e.target.value)}
                className="bg-cream-2 border-border text-ink focus:border-primary"
              />
              <SmsConsentDisclosure className="mt-1.5" />
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-border">
            <h4 className="font-medium text-ink">Player</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="guest-child-first" className="text-ink-muted">First name *</Label>
                <Input
                  id="guest-child-first"
                  value={childFirstName}
                  onChange={(e) => onChildFirstNameChange(e.target.value)}
                  className="bg-cream-2 border-border text-ink focus:border-primary"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="guest-child-last" className="text-ink-muted">Last name *</Label>
                <Input
                  id="guest-child-last"
                  value={childLastName}
                  onChange={(e) => onChildLastNameChange(e.target.value)}
                  className="bg-cream-2 border-border text-ink focus:border-primary"
                />
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
                  className="bg-cream-2 border-border text-ink focus:border-primary"
                />
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
          </div>
        </>
      ) : (
        /* ── ADULT MODE: single registrant form ── */
        <>
          <div>
            <h3 className="text-lg font-semibold text-ink mb-2">Registrant info</h3>
            <p className="text-ink-muted text-sm">
              We'll create an account for you and email a one-tap sign-in link after
              payment. No password needed.
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="guest-parent-first" className="text-ink-muted">First name *</Label>
                <Input
                  id="guest-parent-first"
                  value={parentFirstName}
                  onChange={(e) => onParentFirstNameChange(e.target.value)}
                  className="bg-cream-2 border-border text-ink focus:border-primary"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="guest-parent-last" className="text-ink-muted">Last name *</Label>
                <Input
                  id="guest-parent-last"
                  value={parentLastName}
                  onChange={(e) => onParentLastNameChange(e.target.value)}
                  className="bg-cream-2 border-border text-ink focus:border-primary"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="guest-parent-email" className="text-ink-muted">Email *</Label>
              <Input
                id="guest-parent-email"
                type="email"
                value={parentEmail}
                onChange={(e) => onParentEmailChange(e.target.value)}
                className="bg-cream-2 border-border text-ink focus:border-primary"
              />
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
                value={parentPhone}
                onChange={(e) => onParentPhoneChange(e.target.value)}
                className="bg-cream-2 border-border text-ink focus:border-primary"
              />
              <SmsConsentDisclosure className="mt-1.5" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="guest-adult-birthdate" className="text-ink-muted">Birth date *</Label>
                <Input
                  id="guest-adult-birthdate"
                  type="date"
                  value={adultBirthDate}
                  onChange={(e) => onAdultBirthDateChange(e.target.value)}
                  className="bg-cream-2 border-border text-ink focus:border-primary"
                />
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

      <p className="text-xs text-ink-muted">
        Already have an account?{" "}
        <a
          href={`/signin?redirect=/register/${seasonId}`}
          className="text-primary hover:text-primary/80 font-medium"
        >
          Sign in
        </a>
      </p>
    </div>
  )
}
