"use client"

import { useState } from "react"

/**
 * Inline email-capture band (home). Deliberately NOT a popup — see the
 * aesthetic-evolution spec. Posts to the org-scoped newsletter endpoint.
 * Copy is the pre-discount variant; the discount campaign slice swaps it
 * once the founder sets the amount.
 */
export default function CaptureBand() {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">("idle")

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim()) return
    setStatus("submitting")
    try {
      const res = await fetch("/api/public/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), source: "home-incentive" }),
      })
      if (!res.ok) throw new Error()
      setStatus("ok")
    } catch {
      setStatus("error")
    }
  }

  return (
    <section className="bg-navy-deep text-cream">
      <div className="max-w-[1400px] mx-auto px-6 sm:px-10 lg:px-16 py-12 lg:py-14 flex flex-col md:flex-row md:items-center gap-6">
        <div className="flex-1">
          <h2 className="font-display italic text-2xl lg:text-3xl">Get first dibs on every season.</h2>
          <p className="text-cream/70 mt-2 text-sm">
            New leagues, camps, and pickup blocks — in your inbox before they fill.
          </p>
        </div>
        {status === "ok" ? (
          <p className="flex-1 text-sm font-medium text-cream/90" role="status">
            You're on the list — see you out there.
          </p>
        ) : (
          <form onSubmit={submit} className="flex-1 flex flex-col sm:flex-row gap-2">
            <label htmlFor="capture-band-email" className="sr-only">Email address</label>
            <input
              id="capture-band-email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={status === "submitting"}
              className="flex-1 px-4 py-3 bg-cream/10 border border-cream/30 rounded-lg text-sm text-cream placeholder:text-cream/50 focus:outline-none focus:ring-2 focus:ring-primary/60 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={status === "submitting"}
              className="px-6 py-3 bg-primary text-cream text-sm font-medium tracking-wide uppercase rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-60"
              style={{ letterSpacing: "0.08em" }}
            >
              {status === "submitting" ? "Saving…" : "Count me in"}
            </button>
          </form>
        )}
        {status === "error" && (
          <p className="text-sm text-red-400" role="alert">Couldn't save that — try again.</p>
        )}
      </div>
    </section>
  )
}
