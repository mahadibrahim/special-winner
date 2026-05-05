"use client"

import { useState } from "react"
import { Loader2, CheckCircle2 } from "lucide-react"

type CompanySize = "1-10" | "11-50" | "51-200" | "200+"

export default function CorporateInquiryForm() {
  const [companyName, setCompanyName] = useState("")
  const [contactName, setContactName] = useState("")
  const [contactEmail, setContactEmail] = useState("")
  const [contactPhone, setContactPhone] = useState("")
  const [companySize, setCompanySize] = useState<"" | CompanySize>("")
  const [estimatedTeams, setEstimatedTeams] = useState("")
  const [sportInterest, setSportInterest] = useState("")
  const [preferredLocation, setPreferredLocation] = useState("")
  const [preferredStart, setPreferredStart] = useState("")
  const [notes, setNotes] = useState("")

  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">("idle")
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus("submitting")
    setError(null)

    try {
      const teamCount = estimatedTeams.trim() ? parseInt(estimatedTeams, 10) : undefined
      const res = await fetch("/api/public/corporate-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          contactName: contactName.trim(),
          contactEmail: contactEmail.trim(),
          contactPhone: contactPhone.trim() || undefined,
          companySize: companySize || undefined,
          estimatedTeams: teamCount && !Number.isNaN(teamCount) ? teamCount : undefined,
          sportInterest: sportInterest.trim() || undefined,
          preferredLocation: preferredLocation.trim() || undefined,
          preferredStart: preferredStart.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(json.error ?? "Could not submit inquiry")
      }
      setStatus("ok")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit inquiry")
      setStatus("error")
    }
  }

  if (status === "ok") {
    return (
      <div className="bg-cream-2 border border-primary-orange/30 rounded-2xl p-8">
        <div className="flex items-start gap-4">
          <CheckCircle2 className="w-6 h-6 text-primary-orange flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-display text-2xl text-ink mb-2">Got it.</h3>
            <p className="text-ink-2 leading-relaxed">
              We'll reach out within one business day to scope the season, pick a sport, and
              put a proposal in front of you. If anything's urgent, email{" "}
              <a href="mailto:hello@aspiresportsohio.com" className="text-primary-orange hover:underline">
                hello@aspiresportsohio.com
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Company name" required>
          <Input value={companyName} onChange={setCompanyName} required />
        </Field>
        <Field label="Your name" required>
          <Input value={contactName} onChange={setContactName} required />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Work email" required>
          <Input type="email" value={contactEmail} onChange={setContactEmail} required />
        </Field>
        <Field label="Phone (optional)">
          <Input type="tel" value={contactPhone} onChange={setContactPhone} />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Field label="Company size">
          <select
            value={companySize}
            onChange={(e) => setCompanySize(e.target.value as "" | CompanySize)}
            className="w-full px-3 py-2.5 bg-paper border border-ink/15 rounded-lg text-ink focus:outline-none focus:border-primary-orange transition-colors"
          >
            <option value="">Select…</option>
            <option value="1-10">1–10</option>
            <option value="11-50">11–50</option>
            <option value="51-200">51–200</option>
            <option value="200+">200+</option>
          </select>
        </Field>
        <Field label="Estimated teams">
          <Input
            type="number"
            min="1"
            value={estimatedTeams}
            onChange={setEstimatedTeams}
            placeholder="e.g. 3"
          />
        </Field>
        <Field label="Sport interest">
          <Input
            value={sportInterest}
            onChange={setSportInterest}
            placeholder="Soccer · open"
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Preferred location">
          <Input
            value={preferredLocation}
            onChange={setPreferredLocation}
            placeholder="Worthington · Downtown"
          />
        </Field>
        <Field label="Preferred season">
          <Input
            value={preferredStart}
            onChange={setPreferredStart}
            placeholder="e.g. Summer 2026"
          />
        </Field>
      </div>

      <Field label="Anything else?">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Schedule preferences, league format, anything we should know"
          className="w-full px-3 py-2.5 bg-paper border border-ink/15 rounded-lg text-ink focus:outline-none focus:border-primary-orange transition-colors resize-y"
        />
      </Field>

      {error && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-ink text-cream text-sm font-medium tracking-wide uppercase hover:bg-primary-orange transition-colors disabled:opacity-60"
        style={{ letterSpacing: "0.08em" }}
      >
        {status === "submitting" ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Sending…
          </>
        ) : (
          "Send inquiry →"
        )}
      </button>
    </form>
  )
}

function Field({
  label,
  required,
  children,
}: {
  label: string
  required?: boolean
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted block mb-2">
        {label}
        {required && <span className="text-primary-orange ml-1">*</span>}
      </span>
      {children}
    </label>
  )
}

function Input({
  type = "text",
  value,
  onChange,
  required,
  placeholder,
  min,
}: {
  type?: string
  value: string
  onChange: (v: string) => void
  required?: boolean
  placeholder?: string
  min?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      placeholder={placeholder}
      min={min}
      className="w-full px-3 py-2.5 bg-paper border border-ink/15 rounded-lg text-ink placeholder:text-ink-faint focus:outline-none focus:border-primary-orange transition-colors"
    />
  )
}
