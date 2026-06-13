"use client"

import { useState } from "react"

/**
 * Inline email capture for a `forming` (advertised, not-yet-open) division.
 * Posts to /api/public/season-interest with the seasonId; org-scoped via host,
 * rate-limited, idempotent per (season, email). Replaces the Register CTA on
 * forming cards.
 */
export function SeasonInterestForm({
  seasonId,
  seasonName,
}: {
  seasonId: string
  seasonName: string
}) {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">("idle")
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setStatus("submitting")
    setError(null)
    try {
      const res = await fetch("/api/public/season-interest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonId, email: email.trim() }),
      })
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(json.error ?? "Could not save your interest")
      }
      setStatus("ok")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your interest")
      setStatus("error")
    }
  }

  if (status === "ok") {
    return (
      <p className="text-sm text-sage font-medium">
        You&apos;re on the list for {seasonName} — we&apos;ll email you when registration opens.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          className="flex-1 rounded-md border border-border bg-paper px-3 py-2 text-sm"
          aria-label={`Email for ${seasonName} interest list`}
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          {status === "submitting" ? "…" : "Notify me"}
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  )
}
