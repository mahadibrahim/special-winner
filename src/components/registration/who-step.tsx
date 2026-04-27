"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export type WhoStepProps = {
  /** Current user's first/last name + age eligibility for the active season.
   * Pass null if the user has not signed in or has no birthDate on file. */
  selfOption: { firstName: string; lastName: string; ageEligible: boolean } | null;
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
};

export function WhoStep({
  selfOption,
  dependents,
  selectedKey,
  onSelect,
  onAddDependent,
}: WhoStepProps) {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-2xl font-serif">Who are you registering?</h2>
        <p className="text-muted-foreground mt-1">
          Pick yourself or one of your players. You can add a new player below.
        </p>
      </div>

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

      <Button variant="outline" onClick={onAddDependent} className="w-full">
        + Add a player
      </Button>
    </div>
  );
}
