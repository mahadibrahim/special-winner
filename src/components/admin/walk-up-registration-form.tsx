"use client"

import { useEffect, useState } from "react"
import {
  Loader2,
  UserPlus,
  Phone,
  Mail,
  Calendar,
  CheckCircle2,
  AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

interface SeasonOption {
  id: string
  name: string
  programName: string
  priceCents: number
}

type PaymentStatus = "paid" | "unpaid" | "comped"

interface FormState {
  parentFirstName: string
  parentLastName: string
  parentEmail: string
  parentPhone: string
  kidFirstName: string
  kidLastName: string
  kidBirthDate: string
  kidGender: "male" | "female" | "other" | "prefer_not_to_say" | ""
  kidMedicalNotes: string
  seasonId: string
  paymentStatus: PaymentStatus
  amountPaidCents: number
  waiverSigned: boolean
  notes: string
}

const initialState: FormState = {
  parentFirstName: "",
  parentLastName: "",
  parentEmail: "",
  parentPhone: "",
  kidFirstName: "",
  kidLastName: "",
  kidBirthDate: "",
  kidGender: "",
  kidMedicalNotes: "",
  seasonId: "",
  paymentStatus: "paid",
  amountPaidCents: 0,
  waiverSigned: false,
  notes: "",
}

export function WalkUpRegistrationForm() {
  const [form, setForm] = useState<FormState>(initialState)
  const [seasons, setSeasons] = useState<SeasonOption[]>([])
  const [loadingSeasons, setLoadingSeasons] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{
    registrationId: string
    smsStatus: string
  } | null>(null)

  useEffect(() => {
    async function loadSeasons() {
      try {
        const res = await fetch("/api/admin/seasons?status=open")
        if (!res.ok) throw new Error("Failed to load seasons")
        const data = await res.json()
        const opts: SeasonOption[] = (data.seasons || []).map((s: {
          id: string
          name: string
          program?: { name?: string }
          priceCents?: number
        }) => ({
          id: s.id,
          name: s.name,
          programName: s.program?.name ?? "Unknown program",
          priceCents: s.priceCents ?? 0,
        }))
        setSeasons(opts)
        if (opts.length > 0 && !form.seasonId) {
          setForm((f) => ({ ...f, seasonId: opts[0].id }))
        }
      } catch (err) {
        console.error("Failed to load seasons:", err)
      } finally {
        setLoadingSeasons(false)
      }
    }
    loadSeasons()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const payload = {
        parent: {
          firstName: form.parentFirstName,
          lastName: form.parentLastName,
          email: form.parentEmail,
          phone: form.parentPhone,
        },
        kid: {
          firstName: form.kidFirstName,
          lastName: form.kidLastName,
          birthDate: form.kidBirthDate,
          gender: form.kidGender || undefined,
          medicalNotes: form.kidMedicalNotes || undefined,
        },
        seasonId: form.seasonId,
        paymentStatus: form.paymentStatus,
        amountPaidCents: form.amountPaidCents,
        waiverSigned: form.waiverSigned,
        notes: form.notes || undefined,
      }

      const res = await fetch("/api/admin/walk-up-registration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `Submit failed (${res.status})`)
      }
      setSuccess({
        registrationId: data.registrationId,
        smsStatus: data.smsStatus,
      })
      setForm(initialState)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed")
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="p-8 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-center">
        <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 className="w-7 h-7 text-emerald-600" />
        </div>
        <h3 className="text-xl font-bold text-ink mb-2">
          Registration created
        </h3>
        <p className="text-sm text-ink-2 mb-1">
          Registration ID:{" "}
          <code className="text-xs px-2 py-0.5 rounded bg-cream-2">
            {success.registrationId}
          </code>
        </p>
        <p className="text-sm text-ink-muted mb-6">
          {success.smsStatus === "sent"
            ? "Opt-in welcome SMS delivered. The parent will reply YES to activate messaging."
            : "Registration created but the opt-in SMS didn't go through. Check the parent's phone number and try sending a manual welcome via the messages inbox."}
        </p>
        <Button onClick={() => setSuccess(null)}>Add another walk-up</Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Parent section */}
      <fieldset className="p-5 rounded-xl bg-paper border border-border space-y-4">
        <legend className="text-sm font-semibold text-ink flex items-center gap-2 px-2">
          <UserPlus className="w-4 h-4 text-primary" />
          Parent
        </legend>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">
              First name
            </label>
            <Input
              required
              value={form.parentFirstName}
              onChange={(e) => update("parentFirstName", e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">
              Last name
            </label>
            <Input
              required
              value={form.parentLastName}
              onChange={(e) => update("parentLastName", e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">
            Email
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
            <Input
              required
              type="email"
              value={form.parentEmail}
              onChange={(e) => update("parentEmail", e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">
            Phone
          </label>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
            <Input
              required
              type="tel"
              value={form.parentPhone}
              onChange={(e) => update("parentPhone", e.target.value)}
              placeholder="(614) 555-1234"
              className="pl-10"
            />
          </div>
          <p className="mt-1 text-[10px] text-ink-muted">
            We'll send an opt-in welcome text to this number after saving. Parent replies
            YES to activate messaging.
          </p>
        </div>
      </fieldset>

      {/* Kid section */}
      <fieldset className="p-5 rounded-xl bg-paper border border-border space-y-4">
        <legend className="text-sm font-semibold text-ink px-2">Child</legend>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">
              First name
            </label>
            <Input
              required
              value={form.kidFirstName}
              onChange={(e) => update("kidFirstName", e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">
              Last name
            </label>
            <Input
              required
              value={form.kidLastName}
              onChange={(e) => update("kidLastName", e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">
              Birth date
            </label>
            <Input
              required
              type="date"
              value={form.kidBirthDate}
              onChange={(e) => update("kidBirthDate", e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">
              Gender
            </label>
            <select
              value={form.kidGender}
              onChange={(e) =>
                update(
                  "kidGender",
                  e.target.value as FormState["kidGender"],
                )
              }
              className="w-full px-3 py-2 rounded-md bg-cream-2 border border-border text-sm text-ink"
            >
              <option value="">—</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
              <option value="prefer_not_to_say">Prefer not to say</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">
            Medical notes (optional)
          </label>
          <textarea
            value={form.kidMedicalNotes}
            onChange={(e) => update("kidMedicalNotes", e.target.value)}
            rows={2}
            className="w-full px-3 py-2 rounded-md bg-cream-2 border border-border text-sm text-ink"
            placeholder="Allergies, medications, or anything the coach should know"
          />
        </div>
      </fieldset>

      {/* Season + payment section */}
      <fieldset className="p-5 rounded-xl bg-paper border border-border space-y-4">
        <legend className="text-sm font-semibold text-ink flex items-center gap-2 px-2">
          <Calendar className="w-4 h-4 text-primary" />
          Registration
        </legend>

        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">
            Season
          </label>
          <select
            required
            value={form.seasonId}
            onChange={(e) => update("seasonId", e.target.value)}
            disabled={loadingSeasons}
            className="w-full px-3 py-2 rounded-md bg-cream-2 border border-border text-sm text-ink"
          >
            <option value="">
              {loadingSeasons ? "Loading seasons..." : "Pick a season"}
            </option>
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.programName} — {s.name}
                {s.priceCents > 0 && ` ($${(s.priceCents / 100).toFixed(2)})`}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">
              Payment status
            </label>
            <select
              value={form.paymentStatus}
              onChange={(e) =>
                update("paymentStatus", e.target.value as PaymentStatus)
              }
              className="w-full px-3 py-2 rounded-md bg-cream-2 border border-border text-sm text-ink"
            >
              <option value="paid">Paid in full</option>
              <option value="unpaid">Unpaid — bill later</option>
              <option value="comped">Comped / scholarship</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-ink-muted mb-1.5">
              Amount collected (cents)
            </label>
            <Input
              type="number"
              min={0}
              value={form.amountPaidCents}
              onChange={(e) =>
                update("amountPaidCents", parseInt(e.target.value, 10) || 0)
              }
              disabled={form.paymentStatus !== "paid"}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 mt-2">
          <input
            type="checkbox"
            id="waiver"
            checked={form.waiverSigned}
            onChange={(e) => update("waiverSigned", e.target.checked)}
            className="w-4 h-4"
          />
          <label htmlFor="waiver" className="text-xs text-ink-2">
            Liability waiver signed (parent signed the paper waiver at the front desk)
          </label>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1.5">
            Admin notes (optional)
          </label>
          <textarea
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            rows={2}
            className="w-full px-3 py-2 rounded-md bg-cream-2 border border-border text-sm text-ink"
            placeholder="Any context the next admin should know about this registration"
          />
        </div>
      </fieldset>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2 text-sm text-red-600">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => setForm(initialState)}
          disabled={submitting}
        >
          Clear
        </Button>
        <Button type="submit" disabled={submitting || !form.seasonId}>
          {submitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Create registration"
          )}
        </Button>
      </div>
    </form>
  )
}
