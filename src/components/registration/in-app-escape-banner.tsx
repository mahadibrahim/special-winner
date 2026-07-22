"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { isInAppBrowser } from "@/lib/analytics/in-app-browser"
import { buildBreakoutUrl, type BreakoutResult } from "@/lib/analytics/breakout-link"
import { trackInappBannerShown, trackInappBannerClicked } from "@/lib/analytics/events"

const DISMISS_KEY = "aspire:inapp-banner-dismissed"
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

  useEffect(() => {
    if (typeof window === "undefined") return
    const ua = navigator.userAgent
    if (!isInAppBrowser(ua)) return
    if (sessionStorage.getItem(DISMISS_KEY) === "1") return

    setIsInstagram(INSTAGRAM_UA.test(ua))
    setBreakout(buildBreakoutUrl(window.location.href, ua))
    setVisible(true)
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

          {/* Task 4 adds a "Can't switch? Email yourself a link" disclosure here. */}
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
