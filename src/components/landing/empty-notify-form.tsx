"use client"

import { useState } from "react"
import { track } from "@/lib/analytics/track"

/**
 * Compact email-capture form for empty finder states. When an org has no
 * open seasons, the finder dead-ends — this swaps "check back soon" for a
 * working next step. Posts to the existing /api/public/newsletter endpoint
 * (org-scoped via host, rate-limited, upserts by email).
 */
interface EmptyNotifyFormProps {
  /** Newsletter audience segment for this finder. */
  audience: "parent" | "adult"
  /** Attribution tag stored on the signup row, e.g. "empty-finder-youth". */
  source: string
}

export function EmptyNotifyForm({ audience, source }: EmptyNotifyFormProps) {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">("idle")
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setStatus("submitting")
    setError(null)
    try {
      const res = await fetch("/api/public/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), audience, source }),
      })
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(json.error ?? "Could not save your email")
      }
      setStatus("ok")
      track("newsletter_signup", { source, audience })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your email")
      setStatus("error")
    }
  }

  if (status === "ok") {
    return (
      <p className="mt-4 text-sm font-medium text-primary" role="status">
        You're on the list — we'll email you the moment something opens.
      </p>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 mx-auto max-w-md">
      <div className="flex flex-col sm:flex-row gap-2">
        <label htmlFor={`${source}-email`} className="sr-only">
          Email address
        </label>
        <input
          id={`${source}-email`}
          type="email"
          required
          autoComplete="email"
          placeholder="you@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={status === "submitting"}
          className="flex-1 px-4 py-2.5 bg-cream border border-border rounded-lg text-sm text-ink placeholder:text-ink-muted/60 focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="px-5 py-2.5 bg-ink text-cream text-sm font-medium tracking-wide uppercase rounded-lg hover:bg-primary-bright hover:text-primary-foreground transition-colors disabled:opacity-60"
          style={{ letterSpacing: "0.08em" }}
        >
          {status === "submitting" ? "Saving…" : "Notify me"}
        </button>
      </div>
      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
