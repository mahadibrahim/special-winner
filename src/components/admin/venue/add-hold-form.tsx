"use client"

import { useState } from "react"
import { toast } from "sonner"
import type { VenueResourceSummary } from "@/lib/admin/venue-day-data"

/**
 * Sub-ten-second hold entry: field, times, what it is, save. This is how
 * the venue partner's off-platform bookings (Good Rec, email) get into
 * the field-time ledger — once a hold exists, every booking surface
 * (rentals, games, drop-ins) refuses the slot.
 */
type Props = {
  date: string // YYYY-MM-DD
  resources: VenueResourceSummary[]
  defaultResourceId?: string
  onSaved: () => void
  onCancel: () => void
}

export function AddHoldForm({ date, resources, defaultResourceId, onSaved, onCancel }: Props) {
  const [resourceId, setResourceId] = useState(
    defaultResourceId ?? resources[0]?.id ?? "",
  )
  const [startTime, setStartTime] = useState("18:00")
  const [endTime, setEndTime] = useState("19:00")
  const [sourceType, setSourceType] = useState<"external" | "maintenance">("external")
  const [label, setLabel] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!resourceId || !label.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/venue-day/holds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceId,
          startsAt: new Date(`${date}T${startTime}:00.000Z`).toISOString(),
          endsAt: new Date(`${date}T${endTime}:00.000Z`).toISOString(),
          sourceType,
          label: label.trim(),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "Could not save hold")
        return
      }
      toast.success("Hold added")
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error")
    } finally {
      setSaving(false)
    }
  }

  // Group field options by venue when the location has more than one.
  const venueNames = [...new Set(resources.map((r) => r.venueName))]

  return (
    <div className="bg-white border border-border rounded p-3 space-y-2.5">
      <div className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
        Add hold — blocks this field for everything
      </div>

      <div className="flex flex-wrap gap-2">
        <select
          aria-label="Field"
          value={resourceId}
          onChange={(e) => setResourceId(e.target.value)}
          className="border border-border rounded px-2 py-2 text-sm bg-white"
        >
          {venueNames.map((vn) => (
            <optgroup key={vn} label={vn}>
              {resources
                .filter((r) => r.venueName === vn)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.displayName}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>

        <input
          aria-label="Start time"
          type="time"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="border border-border rounded px-2 py-2 text-sm"
        />
        <span className="self-center text-ink-muted text-sm">–</span>
        <input
          aria-label="End time"
          type="time"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          className="border border-border rounded px-2 py-2 text-sm"
        />

        <select
          aria-label="Hold type"
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value as "external" | "maintenance")}
          className="border border-border rounded px-2 py-2 text-sm bg-white"
        >
          <option value="external">External booking</option>
          <option value="maintenance">Maintenance</option>
        </select>
      </div>

      <input
        aria-label="Label"
        type="text"
        placeholder='e.g. "Good Rec — Smith party"'
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        maxLength={200}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") void submit()
        }}
        className="w-full border border-border rounded px-2.5 py-2 text-sm"
      />

      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => void submit()}
          disabled={saving || !label.trim() || !resourceId}
          className="px-3 py-2 bg-ink text-cream rounded text-sm font-medium disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save hold"}
        </button>
        <button
          onClick={onCancel}
          disabled={saving}
          className="px-3 py-2 border border-border text-ink-muted rounded text-sm font-medium"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
