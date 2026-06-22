"use client"

import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export interface AddDependentFormProps {
  firstName: string
  lastName: string
  birthDate: string
  gender: string
  /**
   * COPPA-aware affirmative consent. The /api/family-members POST schema
   * requires `parentalConsent: true`; without this checkbox the wizard
   * was sending an incomplete body and every customer hit "Validation failed."
   */
  parentalConsent: boolean
  isSubmitting: boolean
  onFirstNameChange: (v: string) => void
  onLastNameChange: (v: string) => void
  onBirthDateChange: (v: string) => void
  onGenderChange: (v: string) => void
  onParentalConsentChange: (v: boolean) => void
  onSubmit: () => void
  onCancel: () => void
}

export function AddDependentForm({
  firstName,
  lastName,
  birthDate,
  gender,
  parentalConsent,
  isSubmitting,
  onFirstNameChange,
  onLastNameChange,
  onBirthDateChange,
  onGenderChange,
  onParentalConsentChange,
  onSubmit,
  onCancel,
}: AddDependentFormProps) {
  return (
    <div className="space-y-4 p-4 rounded-xl border border-border bg-paper">
      <h4 className="font-medium text-ink">Add New Player</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="dependent-first" className="text-ink-muted">First Name *</Label>
          <Input
            id="dependent-first"
            value={firstName}
            onChange={(e) => onFirstNameChange(e.target.value)}
            className="bg-cream-2 border-border text-ink focus:border-primary placeholder:text-ink-faint"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dependent-last" className="text-ink-muted">Last Name *</Label>
          <Input
            id="dependent-last"
            value={lastName}
            onChange={(e) => onLastNameChange(e.target.value)}
            className="bg-cream-2 border-border text-ink focus:border-primary placeholder:text-ink-faint"
          />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="dependent-birthdate" className="text-ink-muted">Birth Date *</Label>
          <Input
            id="dependent-birthdate"
            type="date"
            value={birthDate}
            onChange={(e) => onBirthDateChange(e.target.value)}
            className="bg-cream-2 border-border text-ink focus:border-primary"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dependent-gender" className="text-ink-muted">Gender</Label>
          <Select value={gender} onValueChange={onGenderChange}>
            <SelectTrigger id="dependent-gender" className="bg-cream-2 border-border text-ink">
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
      <div className="rounded-lg border border-border bg-cream-2 p-3 space-y-2">
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={parentalConsent}
            onChange={(e) => onParentalConsentChange(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
          />
          <span className="text-sm text-ink-2">
            I'm the parent or legal guardian of this player, or I'm
            registering on their behalf with their permission.
          </span>
        </label>
      </div>
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={onCancel}
          className="border-border text-ink-muted"
        >
          Cancel
        </Button>
        <Button
          onClick={onSubmit}
          disabled={
            !firstName ||
            !lastName ||
            !birthDate ||
            !parentalConsent ||
            isSubmitting
          }
          className="bg-primary hover:bg-primary/90"
        >
          {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          Add & Select
        </Button>
      </div>
    </div>
  )
}
