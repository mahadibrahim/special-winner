"use client"

import { useState } from "react"
import { toast } from "sonner"

type Props = {
  registrationId: string
  maxAmountCents: number
  onSubmitted?: () => void
}

export function RefundRequestForm({
  registrationId,
  maxAmountCents,
  onSubmitted,
}: Props) {
  const [reason, setReason] = useState("")
  const [amountCents, setAmountCents] = useState(maxAmountCents)
  const [submitting, setSubmitting] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (submitting) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/admin/refund-requests", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ registrationId, reason, amountCents }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      toast.success("Refund request submitted for approval")
      setReason("")
      onSubmitted?.()
    } catch {
      toast.error("Couldn't submit refund request — try again")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-md">
      <label className="block">
        <span className="text-sm font-medium text-ink">Reason</span>
        <textarea
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="mt-1 w-full border border-border rounded p-2 bg-white"
          rows={3}
          placeholder="What happened? Who's making the request?"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-ink">
          Amount (max ${(maxAmountCents / 100).toFixed(2)})
        </span>
        <input
          type="number"
          min={1}
          max={maxAmountCents}
          step={1}
          value={amountCents}
          onChange={(e) => setAmountCents(parseInt(e.target.value, 10) || 0)}
          className="mt-1 w-full border border-border rounded p-2 bg-white"
        />
        <span className="text-xs text-ink-muted">
          {(amountCents / 100).toFixed(2)} USD — adjust if partial refund
        </span>
      </label>
      <button
        type="submit"
        disabled={submitting || !reason.trim() || amountCents <= 0}
        className="px-4 py-2 bg-ink text-cream rounded disabled:opacity-50 min-h-[44px]"
      >
        {submitting ? "Submitting…" : "Submit refund request"}
      </button>
      <p className="text-xs text-ink-muted">
        Requests go to the super-admin queue. You won't process the refund
        yourself.
      </p>
    </form>
  )
}
