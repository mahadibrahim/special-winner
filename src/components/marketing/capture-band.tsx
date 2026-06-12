"use client"

import { useState } from "react"
import {
  CAPTURE_INCENTIVE,
  CAPTURE_INCENTIVE_SOURCE,
  formatIncentiveAmount,
} from "@/lib/marketing/capture-incentive"

/**
 * Inline email-capture band (home). Deliberately NOT a popup — see the
 * aesthetic-evolution spec. Posts to the org-scoped newsletter endpoint;
 * source "home-incentive" triggers the discount-code delivery email.
 * Code/amount come from the capture-incentive campaign config.
 */
export default function CaptureBand() {
  const amount = formatIncentiveAmount(CAPTURE_INCENTIVE.amountCents)
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
        body: JSON.stringify({ email: email.trim(), source: CAPTURE_INCENTIVE_SOURCE }),
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
          <h2 className="font-display italic text-2xl lg:text-3xl">
            Take {amount} off your first season.
          </h2>
          <p className="text-cream/70 mt-2 text-sm">
            Drop your email and we'll send the code straight to your inbox —
            good on any league, camp, or pickup block.
          </p>
        </div>
        {status === "ok" ? (
          <p className="flex-1 text-sm font-medium text-cream/90" role="status">
            Check your inbox — your {amount} code is on the way.
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
              {status === "submitting" ? "Sending…" : "Send my code"}
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
