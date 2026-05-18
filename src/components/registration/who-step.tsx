"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type WhoStepProps = {
  /** Current user's first/last name + age eligibility for the active season.
   * Pass null if the user has not signed in or has no birthDate on file. */
  selfOption: { firstName: string; lastName: string; ageEligible: boolean } | null;
  /**
   * True when the customer is signed in but the user record has no `birthDate`.
   * Renders an inline "Complete your profile" form on the Myself card so the
   * customer isn't silently routed to the dependent-add flow — historically
   * this was the #1 driver of the parental-consent bug on adult leagues
   * (every customer without a stored birthDate hit it).
   */
  needsProfileCompletion?: boolean;
  /**
   * Saving the inline profile-completion form. Wizard sets to true while
   * the PUT /api/user/profile is in flight.
   */
  isSavingProfile?: boolean;
  /**
   * Validation/save error to show on the Myself card. Wizard parses the
   * API response via parseApiError() and passes the resulting message.
   */
  profileError?: string | null;
  /** Inline error to show under the dependent list (e.g. add-player failures). */
  dependentError?: string | null;
  /**
   * Wizard callback invoked when the customer submits the profile form.
   * birthDate is YYYY-MM-DD, gender matches the dropdown set used elsewhere.
   */
  onCompleteProfile?: (data: { birthDate: string; gender?: string }) => void;
  dependents: Array<{
    id: string;
    firstName: string;
    lastName: string;
    birthDate: string;
    ageEligible: boolean;
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
};

export function WhoStep({
  selfOption,
  needsProfileCompletion = false,
  isSavingProfile = false,
  profileError = null,
  dependentError = null,
  onCompleteProfile,
  dependents,
  selectedKey,
  onSelect,
  onAddDependent,
  adultOnly = false,
}: WhoStepProps) {
  const [profileBirthDate, setProfileBirthDate] = useState("");
  const [profileGender, setProfileGender] = useState("");

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

      {/* Profile-completion inline card. Shown when signed in but no birthDate
          on the user record — replaces the previously-silent hide of the
          Myself card. */}
      {needsProfileCompletion && onCompleteProfile && (
        <Card className="p-4 border-primary/30">
          <div className="font-semibold mb-1">Complete your profile</div>
          <p className="text-sm text-muted-foreground mb-3">
            We need your birth date to confirm you're old enough for this
            program. We'll save it on your account so you don't have to
            re-enter it next time.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-ink-muted">Birth date *</Label>
              <Input
                type="date"
                value={profileBirthDate}
                onChange={(e) => setProfileBirthDate(e.target.value)}
                className="bg-cream-2 border-border text-ink"
                aria-label="Birth date"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-ink-muted">
                Gender <span className="text-ink-faint font-normal">(optional)</span>
              </Label>
              <select
                value={profileGender}
                onChange={(e) => setProfileGender(e.target.value)}
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
          {profileError && (
            <div className="text-sm text-destructive mt-2 whitespace-pre-line">
              {profileError}
            </div>
          )}
          <div className="mt-4">
            <Button
              onClick={() =>
                onCompleteProfile({
                  birthDate: profileBirthDate,
                  gender: profileGender || undefined,
                })
              }
              disabled={!profileBirthDate || isSavingProfile}
            >
              {isSavingProfile ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : null}
              Continue
            </Button>
          </div>
        </Card>
      )}

      {selfOption && (
        <Card
          role="button"
          aria-pressed={selectedKey === "self"}
          aria-disabled={!selfOption.ageEligible}
          tabIndex={selfOption.ageEligible ? 0 : -1}
          onClick={() => selfOption.ageEligible && onSelect("self")}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && selfOption.ageEligible) {
              e.preventDefault();
              onSelect("self");
            }
          }}
          className={`p-4 cursor-pointer transition-colors ${
            selectedKey === "self" ? "border-primary ring-2 ring-primary/30" : ""
          } ${!selfOption.ageEligible ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <div className="font-semibold">
            Myself — {selfOption.firstName} {selfOption.lastName}
          </div>
          {!selfOption.ageEligible && (
            <div className="text-xs text-muted-foreground mt-1">
              This program isn't in your age range.
            </div>
          )}
        </Card>
      )}

      {dependents.map((d) => (
        <Card
          key={d.id}
          role="button"
          aria-pressed={selectedKey === d.id}
          aria-disabled={!d.ageEligible}
          tabIndex={d.ageEligible ? 0 : -1}
          onClick={() => d.ageEligible && onSelect(d.id)}
          onKeyDown={(e) => {
            if ((e.key === "Enter" || e.key === " ") && d.ageEligible) {
              e.preventDefault();
              onSelect(d.id);
            }
          }}
          className={`p-4 cursor-pointer transition-colors ${
            selectedKey === d.id ? "border-primary ring-2 ring-primary/30" : ""
          } ${!d.ageEligible ? "opacity-50 cursor-not-allowed" : ""}`}
        >
          <div className="font-semibold">{d.firstName} {d.lastName}</div>
          {!d.ageEligible && (
            <div className="text-xs text-muted-foreground mt-1">
              Not in age range for this program.
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
