"use client"

import { useEffect, useState } from "react"
import { ExternalLink } from "lucide-react"
import { isInAppBrowser } from "@/lib/analytics/in-app-browser"
import { buildBreakoutUrl, type BreakoutResult } from "@/lib/analytics/breakout-link"
import { trackInappBannerShown, trackInappBannerClicked } from "@/lib/analytics/events"

interface InAppEscapePromptProps {
  seasonId: string
}

// Compact, non-dismissible escape hatch rendered directly above the card
// fields on the payment step — webviews only. The passive top-of-wizard
// InAppEscapeBanner stays as-is; this inline placement exists because wallet
// buttons are suppressed in webviews (embedded-payment.tsx) and wallet-first
// buyers need the "use your real browser" path at the moment of payment.
// Copy deliberately does NOT claim state is saved: wizard drafts live in the
// webview's localStorage and don't carry into Safari/Chrome.
// SSR-safe: initial render is null; detection runs client-side in an effect.
export function InAppEscapePrompt({ seasonId }: InAppEscapePromptProps) {
  const [breakout, setBreakout] = useState<BreakoutResult>({ kind: "none", url: null })

  useEffect(() => {
    if (typeof window === "undefined") return
    const ua = navigator.userAgent
    if (!isInAppBrowser(ua)) return
    const built = buildBreakoutUrl(window.location.href, ua)
    if (built.kind === "none" || !built.url) return
    setBreakout(built)
    trackInappBannerShown({ seasonId, variant: "payment_step_inline" })
    // Mount-only: detection inputs (UA, href) don't change within a page view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (breakout.kind === "none" || !breakout.url) return null

  const wallet = breakout.kind === "ios" ? "Apple Pay" : "Google Pay"

  return (
    <div
      data-testid="inapp-escape-prompt"
      className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
    >
      <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>
        Prefer {wallet}?{" "}
        <a
          href={breakout.url}
          onClick={() =>
            trackInappBannerClicked({
              seasonId,
              kind: breakout.kind as "ios" | "android",
              variant: "payment_step_inline",
            })
          }
          className="font-medium underline underline-offset-2 hover:text-amber-950"
        >
          Open this page in your browser
        </a>{" "}
        to use it.
      </p>
    </div>
  )
}
