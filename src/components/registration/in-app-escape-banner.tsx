"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { isInAppBrowser } from "@/lib/analytics/in-app-browser"
import { buildBreakoutUrl, type BreakoutResult } from "@/lib/analytics/breakout-link"
import {
  trackInappBannerShown,
  trackInappBannerClicked,
  trackInappRecaptureRequested,
} from "@/lib/analytics/events"

const DISMISS_KEY = "aspire:inapp-banner-dismissed"
// #460: the banner remounts on chooser↔mode navigation within one page view,
// which re-fired inapp_banner_shown and inflated the funnel's top. One fire
// per (session, season) — the banner is still VISIBLE on every remount, this
// only de-dupes the analytics event.
const SHOWN_KEY_PREFIX = "aspire:inapp-banner-shown:"
// Narrower than in-app-browser.ts's IN_APP_UA (which also matches FBAN/FBAV/
// FB_IAB) — used only to pick the more specific headline copy.
const INSTAGRAM_UA = /Instagram/i

interface InAppEscapeBannerProps {
  seasonId: string
}

// Renders nothing unless the visitor is in a known in-app webview (Instagram/
// Facebook) and hasn't dismissed the banner this session. SSR-safe: the
// initial render is always null — detection only runs client-side in an
// effect, matching the client-side-only signals it depends on
// (navigator.userAgent, window.location, sessionStorage).
export function InAppEscapeBanner({ seasonId }: InAppEscapeBannerProps) {
  const [visible, setVisible] = useState(false)
  const [isInstagram, setIsInstagram] = useState(false)
  const [breakout, setBreakout] = useState<BreakoutResult>({ kind: "none", url: null })

  // "Can't switch? Email/text yourself a link" disclosure — never pre-filled,
  // the visitor types their own address or number.
  const [recaptureOpen, setRecaptureOpen] = useState(false)
  const [recaptureChannel, setRecaptureChannel] = useState<"email" | "sms">("email")
  const [recaptureEmail, setRecaptureEmail] = useState("")
  const [recapturePhone, setRecapturePhone] = useState("")
  const [recaptureStatus, setRecaptureStatus] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle")

  useEffect(() => {
    if (typeof window === "undefined") return
    const ua = navigator.userAgent
    if (!isInAppBrowser(ua)) return
    if (sessionStorage.getItem(DISMISS_KEY) === "1") return

    setIsInstagram(INSTAGRAM_UA.test(ua))
    setBreakout(buildBreakoutUrl(window.location.href, ua))
    setVisible(true)
    // sessionStorage can be denied in some privacy modes — in that case fall
    // back to firing per mount (the pre-#460 behavior) rather than never.
    try {
      const shownKey = `${SHOWN_KEY_PREFIX}${seasonId}`
      if (sessionStorage.getItem(shownKey) === "1") return
      sessionStorage.setItem(shownKey, "1")
    } catch {
      // fall through to the fire
    }
    trackInappBannerShown({ seasonId })
    // Mount-only: detection inputs (UA, href) don't change within a page view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!visible) return null

  function handleDismiss() {
    setVisible(false)
    if (typeof window !== "undefined") sessionStorage.setItem(DISMISS_KEY, "1")
  }

  function handleOpenClick() {
    if (breakout.kind === "none") return
    trackInappBannerClicked({ seasonId, kind: breakout.kind })
  }

  async function handleSendRecapture(e: React.FormEvent) {
    e.preventDefault()
    if (recaptureStatus === "sending") return
    setRecaptureStatus("sending")
    try {
      const res = await fetch("/api/public/register-recapture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          recaptureChannel === "sms"
            ? { seasonId, phone: recapturePhone }
            : { seasonId, email: recaptureEmail },
        ),
      })
      if (!res.ok) {
        setRecaptureStatus("error")
        return
      }
      setRecaptureStatus("sent")
      trackInappRecaptureRequested({ seasonId, channel: recaptureChannel })
    } catch {
      setRecaptureStatus("error")
    }
  }

  return (
    <div
      data-testid="inapp-escape-banner"
      className="rounded-2xl bg-amber-50 border border-amber-200 p-4 mb-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-amber-900">
            {isInstagram ? "You're in Instagram's browser" : "You're in an in-app browser"}
          </h3>
          <p className="text-sm text-amber-800 mt-1">
            Payment works best in Safari or Chrome — Apple Pay and autofill are blocked here.
          </p>

          {breakout.kind !== "none" && breakout.url ? (
            <a
              href={breakout.url}
              onClick={handleOpenClick}
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-amber-900 underline underline-offset-2 hover:text-amber-950"
            >
              Open in browser →
            </a>
          ) : null}

          {recaptureStatus === "sent" ? (
            <p className="mt-3 text-sm text-amber-800">
              {recaptureChannel === "sms"
                ? "Sent — check your texts."
                : "Sent — check your email."}
            </p>
          ) : recaptureOpen ? (
            <form
              onSubmit={handleSendRecapture}
              className="mt-3 flex flex-wrap items-center gap-2"
            >
              <div
                role="tablist"
                aria-label="Send link via"
                className="flex w-full gap-1 rounded-lg bg-amber-100 p-0.5"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={recaptureChannel === "email"}
                  onClick={() => {
                    setRecaptureChannel("email")
                    if (recaptureStatus === "error") setRecaptureStatus("idle")
                  }}
                  className={`flex-1 rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                    recaptureChannel === "email"
                      ? "bg-white text-amber-900 shadow-sm"
                      : "text-amber-700"
                  }`}
                >
                  Email
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={recaptureChannel === "sms"}
                  onClick={() => {
                    setRecaptureChannel("sms")
                    if (recaptureStatus === "error") setRecaptureStatus("idle")
                  }}
                  className={`flex-1 rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                    recaptureChannel === "sms"
                      ? "bg-white text-amber-900 shadow-sm"
                      : "text-amber-700"
                  }`}
                >
                  Text
                </button>
              </div>

              {recaptureChannel === "sms" ? (
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  required
                  placeholder="(614) 555-0100"
                  value={recapturePhone}
                  onChange={(e) => {
                    setRecapturePhone(e.target.value)
                    if (recaptureStatus === "error") setRecaptureStatus("idle")
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm text-amber-900 placeholder:text-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              ) : (
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  required
                  placeholder="you@example.com"
                  value={recaptureEmail}
                  onChange={(e) => {
                    setRecaptureEmail(e.target.value)
                    if (recaptureStatus === "error") setRecaptureStatus("idle")
                  }}
                  className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm text-amber-900 placeholder:text-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              )}
              <button
                type="submit"
                disabled={recaptureStatus === "sending"}
                className="rounded-lg bg-amber-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {recaptureStatus === "sending" ? "Sending…" : "Send link"}
              </button>
              {recaptureStatus === "error" ? (
                <p className="w-full text-sm text-red-700">
                  {recaptureChannel === "sms"
                    ? "Couldn't send that — check the number and try again."
                    : "Couldn't send that — check the address and try again."}
                </p>
              ) : null}
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setRecaptureOpen(true)}
              className="mt-3 block text-sm font-medium text-amber-900 underline underline-offset-2 hover:text-amber-950"
            >
              Can't switch? Email or text yourself a link
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="flex-shrink-0 p-1 rounded-lg hover:bg-amber-100 text-amber-700 hover:text-amber-900 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export default InAppEscapeBanner
