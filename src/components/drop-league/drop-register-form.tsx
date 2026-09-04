"use client"

import { useState } from "react"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"

/**
 * BMI-gated registration form for a Drop League season.
 * Posts to /api/public/drop-register; the server computes/gates on BMI —
 * the form never displays or hints at the BMI value to the player.
 */
export function DropRegisterForm({
  dropSeasonId,
  division,
  seasonName,
}: {
  dropSeasonId: string
  division: "mens" | "womens"
  seasonName: string
}) {
  useHydrationBeacon()
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "ineligible" | "error">("idle")
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dob: "",
    heightFeet: "5",
    heightInches: "8",
    weightLbs: "",
    consent: false,
  })

  const set = (field: keyof typeof form, value: string | boolean) =>
    setForm((prev) => ({ ...prev, [field]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.consent) return
    setStatus("submitting")
    setError(null)

    try {
      const body: Record<string, unknown> = {
        dropSeasonId,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        email: form.email.trim(),
        heightFeet: parseInt(form.heightFeet, 10),
        heightInches: parseInt(form.heightInches, 10),
        weightLbs: parseFloat(form.weightLbs),
        consent: true,
      }
      if (form.phone.trim()) body.phone = form.phone.trim()
      if (form.dob) body.dob = form.dob

      const res = await fetch("/api/public/drop-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        setStatus("ok")
        return
      }

      const json = (await res.json().catch(() => ({}))) as { error?: string }

      if (res.status === 422 && json.error === "not_eligible") {
        setStatus("ineligible")
        return
      }

      throw new Error(json.error ?? "Something went wrong — please try again.")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — please try again.")
      setStatus("error")
    }
  }

  if (status === "ok") {
    return (
      <div className="rounded-lg bg-green-50 border border-green-200 p-5 text-sm">
        <p className="font-semibold text-green-800">You&apos;re in!</p>
        <p className="mt-1 text-green-700">
          You&apos;re registered for <strong>{seasonName}</strong>. We&apos;ll be in touch with session details.
        </p>
      </div>
    )
  }

  if (status === "ineligible") {
    return (
      <div className="rounded-lg bg-amber-50 border border-amber-200 p-5 text-sm">
        <p className="font-semibold text-amber-900">Not quite the right fit — but we&apos;re glad you reached out.</p>
        <p className="mt-1 text-amber-800">
          The Drop League is designed for players with a BMI of 27.5 or above, so it&apos;s not the
          right fit right now — but we&apos;d love to see you in our other leagues.{" "}
          <a href="/adult/leagues" className="underline font-medium hover:text-amber-900">
            Browse adult leagues →
          </a>
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Name row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={`dl-first-${division}`} className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
            First name
          </label>
          <input
            id={`dl-first-${division}`}
            type="text"
            required
            autoComplete="given-name"
            value={form.firstName}
            onChange={(e) => set("firstName", e.target.value)}
            className="rounded-md border border-border bg-paper px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-orange/40"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`dl-last-${division}`} className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
            Last name
          </label>
          <input
            id={`dl-last-${division}`}
            type="text"
            required
            autoComplete="family-name"
            value={form.lastName}
            onChange={(e) => set("lastName", e.target.value)}
            className="rounded-md border border-border bg-paper px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-orange/40"
          />
        </div>
      </div>

      {/* Email + Phone row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={`dl-email-${division}`} className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
            Email
          </label>
          <input
            id={`dl-email-${division}`}
            type="email"
            required
            autoComplete="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            className="rounded-md border border-border bg-paper px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-orange/40"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`dl-phone-${division}`} className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
            Phone <span className="normal-case font-normal text-ink-faint">(optional)</span>
          </label>
          <input
            id={`dl-phone-${division}`}
            type="tel"
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => set("phone", e.target.value)}
            className="rounded-md border border-border bg-paper px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-orange/40"
          />
        </div>
      </div>

      {/* DOB */}
      <div className="flex flex-col gap-1">
        <label htmlFor={`dl-dob-${division}`} className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
          Date of birth <span className="normal-case font-normal text-ink-faint">(optional)</span>
        </label>
        <input
          id={`dl-dob-${division}`}
          type="date"
          autoComplete="bday"
          value={form.dob}
          onChange={(e) => set("dob", e.target.value)}
          className="rounded-md border border-border bg-paper px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-orange/40 w-full sm:w-48"
        />
      </div>

      {/* Height + Weight */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
            Height
          </span>
          <div className="flex gap-2">
            <div className="flex flex-col gap-0.5 flex-1">
              <select
                aria-label="Height feet"
                required
                value={form.heightFeet}
                onChange={(e) => set("heightFeet", e.target.value)}
                className="rounded-md border border-border bg-paper px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-orange/40"
              >
                {[4, 5, 6, 7].map((ft) => (
                  <option key={ft} value={String(ft)}>{ft} ft</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-0.5 flex-1">
              <select
                aria-label="Height inches"
                required
                value={form.heightInches}
                onChange={(e) => set("heightInches", e.target.value)}
                className="rounded-md border border-border bg-paper px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-orange/40"
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={String(i)}>{i} in</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`dl-weight-${division}`} className="text-xs font-semibold tracking-wide text-ink-muted uppercase">
            Weight (lbs)
          </label>
          <input
            id={`dl-weight-${division}`}
            type="number"
            required
            min={80}
            max={600}
            step={0.1}
            placeholder="e.g. 220"
            value={form.weightLbs}
            onChange={(e) => set("weightLbs", e.target.value)}
            className="rounded-md border border-border bg-paper px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-orange/40"
          />
        </div>
      </div>

      {/* Consent */}
      <label className="flex items-start gap-2.5 cursor-pointer group">
        <input
          type="checkbox"
          required
          checked={form.consent}
          onChange={(e) => set("consent", e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-primary-orange cursor-pointer"
        />
        <span className="text-sm text-ink-muted group-has-[:checked]:text-ink">
          I consent to Aspire Sports storing my height and weight for the Drop League.
        </span>
      </label>

      {status === "error" && error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      <button
        type="submit"
        disabled={status === "submitting" || !form.consent}
        className="rounded-md bg-primary-bright px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60 transition-opacity hover:opacity-90"
      >
        {status === "submitting" ? "Registering…" : `Register for ${division === "mens" ? "Men's" : "Women's"} — ${seasonName}`}
      </button>
    </form>
  )
}
