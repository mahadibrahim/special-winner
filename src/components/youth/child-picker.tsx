"use client"

import { useEffect, useState } from "react"
import { AddDependentForm } from "@/components/registration/add-dependent-form"
import { Button } from "@/components/ui/button"
import { ErrorBanner } from "@/components/ui/error-banner"
import { LoadingSkeleton } from "@/components/ui/loading-skeleton"

/**
 * Shared child picker — fetches the caller's `family_members` and renders
 * them as selectable cards, age-filtered against an optional `ageRange`.
 * Extracted out of trial-booking.tsx (Task 5) so Task 6 (per the plan) can
 * reuse it verbatim rather than re-implementing the same fetch/add-player
 * flow.
 *
 * "+ Add a player" reuses `AddDependentForm`
 * (src/components/registration/add-dependent-form.tsx) — the exact
 * component the registration wizard uses — and POSTs to the exact same
 * `/api/family-members` endpoint with the same payload shape (see
 * registration-wizard.tsx's `handleAddMember`), including the required
 * `parentalConsent: true` the endpoint's Zod schema demands.
 */

export interface ChildPickerMember {
  id: string
  firstName: string
  lastName: string
  birthDate: string | null
  kind: "self" | "dependent"
}

export interface ChildAgeRange {
  minAge: number | null
  maxAge: number | null
}

export interface ChildPickerProps {
  /** Age range to filter/label eligibility against — typically a class
   *  slot's minAge/maxAge. Pass `{ minAge: null, maxAge: null }` for a
   *  context with no age gate (every child renders eligible). */
  ageRange: ChildAgeRange
  selectedId: string | null
  onSelect: (member: ChildPickerMember) => void
  /** Disables every card + the add-player button (e.g. while a booking
   *  request for the current selection is in flight). */
  disabled?: boolean
}

/** Mirrors `ageOnDate` in src/lib/classes/book-child.ts (also duplicated in
 *  choose-slot.tsx) — duplicated here rather than imported because that
 *  module pulls in server-only drizzle/db dependencies that can't ship in a
 *  client bundle. */
function ageOnDate(birthDate: string, onDate: Date): number {
  const [by, bm, bd] = birthDate.split("-").map(Number)
  let age = onDate.getUTCFullYear() - by
  const monthDiff = onDate.getUTCMonth() + 1 - bm
  if (monthDiff < 0 || (monthDiff === 0 && onDate.getUTCDate() < bd)) {
    age -= 1
  }
  return age
}

function isEligible(age: number | null, range: ChildAgeRange): boolean {
  if (age === null) return true
  if (range.minAge !== null && age < range.minAge) return false
  if (range.maxAge !== null && age > range.maxAge) return false
  return true
}

function formatAgeRange(range: ChildAgeRange): string {
  if (range.minAge === null && range.maxAge === null) return ""
  if (range.minAge !== null && range.maxAge !== null) return `Ages ${range.minAge}–${range.maxAge}`
  if (range.minAge !== null) return `Ages ${range.minAge}+`
  return `Ages up to ${range.maxAge}`
}

type Phase = "loading" | "error" | "ready"

export function ChildPicker({ ageRange, selectedId, onSelect, disabled = false }: ChildPickerProps) {
  const [phase, setPhase] = useState<Phase>("loading")
  const [members, setMembers] = useState<ChildPickerMember[]>([])

  const [showAdd, setShowAdd] = useState(false)
  const [addFirstName, setAddFirstName] = useState("")
  const [addLastName, setAddLastName] = useState("")
  const [addBirthDate, setAddBirthDate] = useState("")
  const [addGender, setAddGender] = useState("")
  const [addConsent, setAddConsent] = useState(false)
  const [isAdding, setIsAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load() {
    setPhase("loading")
    try {
      const res = await fetch("/api/family-members")
      if (!res.ok) throw new Error("bad status")
      const body = (await res.json()) as { familyMembers: ChildPickerMember[] }
      setMembers(body.familyMembers)
      setPhase("ready")
    } catch {
      setPhase("error")
    }
  }

  function resetAddForm() {
    setAddFirstName("")
    setAddLastName("")
    setAddBirthDate("")
    setAddGender("")
    setAddConsent(false)
    setAddError(null)
  }

  async function handleAdd() {
    if (!addFirstName || !addLastName || !addBirthDate || !addConsent) return
    setIsAdding(true)
    setAddError(null)
    try {
      const res = await fetch("/api/family-members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: addFirstName,
          lastName: addLastName,
          birthDate: addBirthDate,
          gender: addGender || undefined,
          // The endpoint's Zod schema requires this to be exactly `true` —
          // see add-dependent-form.tsx's doc comment for the incident this
          // guarded against.
          parentalConsent: true,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        const message =
          data?.error === "Validation failed"
            ? "Please check the player's details and try again."
            : typeof data?.error === "string"
              ? data.error
              : "Could not add player — please try again.";
        throw new Error(message)
      }
      const data = (await res.json()) as { familyMember: Omit<ChildPickerMember, "kind"> }
      const newMember: ChildPickerMember = { ...data.familyMember, kind: "dependent" }
      setMembers((prev) => [...prev, newMember])
      setShowAdd(false)
      resetAddForm()
      onSelect(newMember)
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Could not add player — please try again.")
    } finally {
      setIsAdding(false)
    }
  }

  if (phase === "loading") {
    return <LoadingSkeleton variant="card" rows={2} />
  }

  if (phase === "error") {
    return (
      <div className="py-4 text-center space-y-2">
        <ErrorBanner message="Couldn't load your players." />
        <button
          type="button"
          onClick={() => void load()}
          className="text-sm text-ink-muted underline underline-offset-2 hover:text-ink"
        >
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {members.length > 0 && (
        <div className="space-y-2">
          {members.map((m) => {
            const age = m.birthDate ? ageOnDate(m.birthDate, new Date()) : null
            const eligible = isEligible(age, ageRange)
            const isSelected = selectedId === m.id
            return (
              <button
                key={m.id}
                type="button"
                disabled={!eligible || disabled}
                onClick={() => eligible && !disabled && onSelect(m)}
                aria-pressed={isSelected}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                  !eligible
                    ? "border-cream-3 bg-cream-2 opacity-60 cursor-not-allowed"
                    : isSelected
                      ? "border-brand-red bg-brand-red/5"
                      : "border-cream-3 hover:border-brand-red/40"
                }`}
              >
                <div className="font-medium text-ink ph-mask">
                  {m.firstName} {m.lastName}
                </div>
                <div className="text-xs text-ink-muted mt-0.5">
                  {age !== null ? `Age ${age}` : "Age unknown"}
                  {!eligible && formatAgeRange(ageRange) ? ` — ${formatAgeRange(ageRange)}` : ""}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {members.length === 0 && !showAdd && (
        <p className="text-sm text-ink-muted">Add your player below to get started.</p>
      )}

      {showAdd ? (
        <div className="space-y-2">
          <AddDependentForm
            firstName={addFirstName}
            lastName={addLastName}
            birthDate={addBirthDate}
            gender={addGender}
            parentalConsent={addConsent}
            isSubmitting={isAdding}
            onFirstNameChange={setAddFirstName}
            onLastNameChange={setAddLastName}
            onBirthDateChange={setAddBirthDate}
            onGenderChange={setAddGender}
            onParentalConsentChange={setAddConsent}
            onSubmit={() => void handleAdd()}
            onCancel={() => {
              setShowAdd(false)
              resetAddForm()
            }}
          />
          <ErrorBanner message={addError} />
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowAdd(true)}
          disabled={disabled}
          className="w-full"
        >
          + Add a player
        </Button>
      )}
    </div>
  )
}
