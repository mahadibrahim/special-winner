"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SmsConsentCheckbox } from "@/components/sms/sms-consent-checkbox";
import { normalizePhone, formatPhone } from "@/lib/phone";

/**
 * Profile data the wizard already has for the signed-in user. The Select
 * Player step inspects this to decide which fields to ask for inline —
 * customers who skipped any of {firstName, lastName, phone, birthDate} at
 * signup get prompted here so they're not silently routed into the broken
 * dependent-add path.
 */
export interface SelfProfileSnapshot {
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  birthDate: string | null;
  gender: string | null;
}

export interface SelfProfileUpdate {
  firstName?: string;
  lastName?: string;
  phone?: string;
  birthDate?: string;
  gender?: string;
  /** Only present when the form collected a phone; reflects the consent checkbox. */
  smsConsent?: boolean;
}

export type WhoStepProps = {
  /** Current user's first/last name + age eligibility for the active season.
   * Pass null if the user has not signed in or has no birthDate on file.
   * `registered` marks a pre-existing, non-cancelled/refunded registration
   * for THIS season — the card shows a "Registered ✓" badge and can't be
   * selected (Task 5's per-person state; a global block is a decision the
   * wizard makes separately for adult-locked flows, not this component). */
  selfOption: {
    firstName: string;
    lastName: string;
    ageEligible: boolean;
    /** Audit F1: the exact age-range/contact-us copy to show when
     *  `ageEligible` is false. Falls back to a generic message when absent
     *  (e.g. no age group on this season). */
    ageIneligibleMessage?: string | null;
    registered?: boolean;
  } | null;
  /**
   * Current profile snapshot. When this is non-null AND any required field
   * is missing, the step renders an inline "Complete your profile" form
   * collecting ONLY the missing fields.
   */
  selfProfile?: SelfProfileSnapshot | null;
  /**
   * Saving the inline profile-completion form. Wizard sets to true while
   * the PUT /api/user/profile is in flight.
   */
  isSavingProfile?: boolean;
  /**
   * Validation/save error to show on the form. Wizard parses the API
   * response via parseApiError() and passes the resulting message.
   */
  profileError?: string | null;
  /** Inline error to show under the dependent list (e.g. add-player failures). */
  dependentError?: string | null;
  /**
   * Wizard callback invoked when the customer submits the profile form.
   * Only includes the keys the customer actually edited (we don't blank
   * stored fields on the server).
   */
  onCompleteProfile?: (data: SelfProfileUpdate) => void;
  dependents: Array<{
    id: string;
    firstName: string;
    lastName: string;
    // Null for adult self-registrants whose DOB is still pending
    // post-payment review (their row can surface here alongside dependents).
    birthDate: string | null;
    ageEligible: boolean;
    /** Audit F1: the exact age-range/contact-us copy to show when
     *  `ageEligible` is false. Falls back to a generic message when absent. */
    ageIneligibleMessage?: string | null;
    /** Already has a non-cancelled/refunded registration for THIS season. */
    registered?: boolean;
  }>;
  /** "self" or a dependent id, or null when nothing is selected yet. */
  selectedKey: string | null;
  onSelect: (key: string) => void;
  onAddDependent: () => void;
  /**
   * Hide the "+ Add a player" button when the program is adult-only
   * (minAge >= 18). There's no legitimate parent-adds-child path for
   * adult leagues.
   */
  adultOnly?: boolean;
  /**
   * Defer birth date to the post-payment waiver step (adult v2 flow). When set,
   * a missing DOB does not surface the pre-payment "Complete your profile" form.
   */
  deferBirthDate?: boolean;
};

/** A field is "missing" if the stored value is null/empty or, for phone,
 *  doesn't normalize to 10 digits (so we re-prompt malformed numbers).
 *  Note: phone is not part of the `any` gate — it does not block the form.
 *  Only firstName, lastName, and birthDate block. */
export function computeMissing(
  profile: SelfProfileSnapshot,
  // Adult (v2) self-registration defers DOB to the post-payment waiver step, so
  // a missing birth date must NOT block the pre-payment "who" step — otherwise a
  // signed-in adult hits a "Complete your profile" wall before they can pay.
  deferBirthDate = false,
): {
  firstName: boolean;
  lastName: boolean;
  phone: boolean;
  birthDate: boolean;
  any: boolean;
} {
  const missing = {
    firstName: !profile.firstName?.trim(),
    lastName: !profile.lastName?.trim(),
    phone: !normalizePhone(profile.phone ?? ""),
    birthDate: deferBirthDate ? false : !profile.birthDate,
  };
  // Phone does not block the form — only firstName, lastName, birthDate.
  const any = missing.firstName || missing.lastName || missing.birthDate;
  return { ...missing, any };
}

export function WhoStep({
  selfOption,
  selfProfile = null,
  isSavingProfile = false,
  profileError = null,
  dependentError = null,
  onCompleteProfile,
  dependents,
  selectedKey,
  onSelect,
  onAddDependent,
  adultOnly = false,
  deferBirthDate = false,
}: WhoStepProps) {
  // Pre-fill any fields we already know — the customer just confirms or
  // edits. Phone is reformatted into the (NNN) NNN-NNNN display while
  // editing; submit converts back to the 10-digit normalized form.
  const [firstName, setFirstName] = useState(selfProfile?.firstName ?? "");
  const [lastName, setLastName] = useState(selfProfile?.lastName ?? "");
  const [phone, setPhone] = useState(formatPhone(selfProfile?.phone ?? ""));
  const [smsConsent, setSmsConsent] = useState(false);
  const [birthDate, setBirthDate] = useState(selfProfile?.birthDate ?? "");
  const [gender, setGender] = useState(selfProfile?.gender ?? "");

  const missing = selfProfile ? computeMissing(selfProfile, deferBirthDate) : null;
  const showCompletionForm = Boolean(
    selfProfile && missing?.any && onCompleteProfile,
  );

  const normalizedPhone = normalizePhone(phone);
  const phoneValid = normalizedPhone.length === 10;

  // Required fields for THIS form are exactly the ones currently missing.
  // Phone is optional: if typed, must be valid; if empty, that's fine.
  const requiredOk =
    (!missing?.firstName || firstName.trim().length > 0) &&
    (!missing?.lastName || lastName.trim().length > 0) &&
    (phone.trim().length === 0 || phoneValid) &&
    (!missing?.birthDate || birthDate.length > 0);

  const handleSubmitProfile = () => {
    if (!onCompleteProfile || !missing) return;
    const update: SelfProfileUpdate = {};
    if (missing.firstName) update.firstName = firstName.trim();
    if (missing.lastName) update.lastName = lastName.trim();
    // Submit phone if the user typed a valid one (even if not originally missing).
    if (phone.trim().length > 0 && normalizedPhone.length === 10) {
      update.phone = normalizedPhone;
      update.smsConsent = smsConsent;
    }
    if (missing.birthDate) update.birthDate = birthDate;
    if (gender) update.gender = gender;
    onCompleteProfile(update);
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-2xl font-serif">Who are you registering?</h2>
        <p className="text-muted-foreground mt-1">
          {adultOnly
            ? "Confirm you're the player. Adult leagues are self-registration only."
            : "Pick yourself or one of your players. You can add a new player below."}
        </p>
      </div>

      {/* Inline profile-completion: shown when signed in but any required
          field is missing on the user record. We render ONLY the fields
          that are missing so customers with partial profiles don't get
          re-prompted for data we already have. */}
      {showCompletionForm && missing && (
        <Card className="p-4 border-primary/30">
          <div className="font-semibold mb-1">Complete your profile</div>
          <p className="text-sm text-muted-foreground mb-3">
            We need a few more details to register you. We'll save these on
            your account so you don't have to re-enter them next time.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {missing.firstName && (
              <div className="space-y-1">
                <Label className="text-ink-muted">First name *</Label>
                <Input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                  className="bg-cream-2 border-border text-ink"
                  aria-label="First name"
                />
              </div>
            )}
            {missing.lastName && (
              <div className="space-y-1">
                <Label className="text-ink-muted">Last name *</Label>
                <Input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="family-name"
                  className="bg-cream-2 border-border text-ink"
                  aria-label="Last name"
                />
              </div>
            )}
            {missing.phone && (
              <div className="space-y-1">
                <Label className="text-ink-muted">
                  Phone{" "}
                  <span className="text-ink-faint font-normal">(optional)</span>
                </Label>
                <Input
                  type="tel"
                  inputMode="tel"
                  placeholder="(555) 555-0123"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  onBlur={() => setPhone(formatPhone(phone))}
                  autoComplete="tel"
                  className="bg-cream-2 border-border text-ink"
                  aria-label="Phone number"
                />
                {phone && !phoneValid && (
                  <div className="text-xs text-destructive">
                    Enter a 10-digit US number.
                  </div>
                )}
              </div>
            )}
            {missing.birthDate && (
              <div className="space-y-1">
                <Label className="text-ink-muted">Birth date *</Label>
                <Input
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  className="bg-cream-2 border-border text-ink"
                  aria-label="Birth date"
                />
              </div>
            )}
            {/* Gender is always optional. We surface it whenever the form is
                shown — never required, never blocks submit. */}
            <div className="space-y-1">
              <Label className="text-ink-muted">
                Gender{" "}
                <span className="text-ink-faint font-normal">(optional)</span>
              </Label>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="w-full h-10 rounded-md border border-border bg-cream-2 px-3 text-sm text-ink"
                aria-label="Gender"
              >
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer_not_to_say">Prefer not to say</option>
              </select>
            </div>
          </div>
          {/* SMS consent sits below the field grid so the required 10DLC
              disclosure gets full width rather than a cramped grid column.
              Show it when the user has typed a phone, whether or not it was missing. */}
          {phone.trim().length > 0 && (
            <SmsConsentCheckbox
              id="sms-consent-profile"
              checked={smsConsent}
              onCheckedChange={setSmsConsent}
              className="mt-4"
            />
          )}
          {profileError && (
            <div className="text-sm text-destructive mt-2 whitespace-pre-line">
              {profileError}
            </div>
          )}
          <div className="mt-4">
            <Button
              onClick={handleSubmitProfile}
              disabled={!requiredOk || isSavingProfile}
            >
              {isSavingProfile ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Save profile
            </Button>
          </div>
        </Card>
      )}

      {/* Myself card is hidden until the profile is complete. Otherwise
          customers could pick Myself + click the wizard's main Continue
          and bypass the profile-completion form entirely. */}
      {!showCompletionForm && selfOption && (
        <Card
          role="button"
          aria-pressed={selectedKey === "self"}
          aria-disabled={!selfOption.ageEligible || Boolean(selfOption.registered)}
          tabIndex={selfOption.ageEligible && !selfOption.registered ? 0 : -1}
          onClick={() =>
            selfOption.ageEligible && !selfOption.registered && onSelect("self")
          }
          onKeyDown={(e) => {
            if (
              (e.key === "Enter" || e.key === " ") &&
              selfOption.ageEligible &&
              !selfOption.registered
            ) {
              e.preventDefault();
              onSelect("self");
            }
          }}
          className={`p-4 cursor-pointer transition-colors ${
            selectedKey === "self" ? "border-primary ring-2 ring-primary/30" : ""
          } ${
            !selfOption.ageEligible || selfOption.registered
              ? "opacity-50 cursor-not-allowed"
              : ""
          }`}
        >
          <div className="font-semibold flex items-center gap-2">
            <span>
              Myself — {selfOption.firstName} {selfOption.lastName}
            </span>
            {selfOption.registered && (
              <span className="text-xs font-medium text-emerald-700 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                Registered ✓
              </span>
            )}
          </div>
          {!selfOption.registered && !selfOption.ageEligible && (
            <div className="text-xs text-muted-foreground mt-1">
              {selfOption.ageIneligibleMessage || "This program isn't in your age range."}
            </div>
          )}
        </Card>
      )}

      {/* Dependents only appear for youth/all-ages programs. For an adult-
          only program the subtitle promises "self-registration only" and
          there's no legitimate path to register a dependent — showing them
          here contradicts the copy and creates the double-card bug (an
          existing dependent record with the same name as the registrant
          appearing alongside the Myself card). */}
      {!adultOnly &&
        dependents.map((d) => (
          <Card
            key={d.id}
            role="button"
            aria-pressed={selectedKey === d.id}
            aria-disabled={!d.ageEligible || Boolean(d.registered)}
            tabIndex={d.ageEligible && !d.registered ? 0 : -1}
            onClick={() => d.ageEligible && !d.registered && onSelect(d.id)}
            onKeyDown={(e) => {
              if ((e.key === "Enter" || e.key === " ") && d.ageEligible && !d.registered) {
                e.preventDefault();
                onSelect(d.id);
              }
            }}
            className={`p-4 cursor-pointer transition-colors ${
              selectedKey === d.id ? "border-primary ring-2 ring-primary/30" : ""
            } ${!d.ageEligible || d.registered ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <div className="font-semibold flex items-center gap-2">
              <span className="ph-mask">{d.firstName} {d.lastName}</span>
              {d.registered && (
                <span className="text-xs font-medium text-emerald-700 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  Registered ✓
                </span>
              )}
            </div>
            {!d.registered && !d.ageEligible && (
              <div className="text-xs text-muted-foreground mt-1">
                {d.ageIneligibleMessage || "Not in age range for this program."}
              </div>
            )}
          </Card>
        ))}

      {dependentError && (
        <div className="text-sm text-destructive whitespace-pre-line">
          {dependentError}
        </div>
      )}

      {/* Hide the Add Player affordance on adult-only programs — there's no
          legitimate "parent registers their kid" path for an 18+ league. */}
      {!adultOnly && (
        <Button variant="outline" onClick={onAddDependent} className="w-full">
          + Add a player
        </Button>
      )}
    </div>
  );
}
