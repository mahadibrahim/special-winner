"use client"

import { useEffect, useState } from "react"
import { ArrowRight, X } from "lucide-react"

/**
 * RegistrationRibbon — slim persistent CTA at the top of the page.
 *
 * Appears on marketing/content pages; auto-hides on:
 *  - the registration funnel itself (/programs, /register, /payment)
 *  - authed surfaces (/dashboard, /admin, /coach, /account)
 *  - auth pages (/signin, /signup, /forgot-password, /verify-email)
 *
 * Dismissible per session via sessionStorage — the visitor sees it once
 * per visit. Fetches the open-season count + nearest deadline from the
 * public seasons API for honest, dynamic copy.
 */

interface Season {
  status: string
  startDate: string | null
}

const HIDE_PREFIXES = [
  "/programs",
  "/register",
  "/payment",
  "/dashboard",
  "/admin",
  "/coach",
  "/account",
  "/messages",
  "/media",
  "/signin",
  "/signup",
  "/forgot-password",
  "/verify-email",
  "/auth",
]

const DISMISS_KEY = "aspire:ribbon:dismissed"

function shouldHideForPath(pathname: string): boolean {
  return HIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export default function RegistrationRibbon() {
  const [mounted, setMounted] = useState(false)
  const [dismissed, setDismissed] = useState(true)
  const [openCount, setOpenCount] = useState<number | null>(null)
  const [nearestDeadlineDays, setNearestDeadlineDays] = useState<number | null>(null)

  useEffect(() => {
    setMounted(true)

    if (shouldHideForPath(window.location.pathname)) return

    const wasDismissed = sessionStorage.getItem(DISMISS_KEY) === "1"
    setDismissed(wasDismissed)
    if (wasDismissed) return

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/public/seasons?status=open")
        if (!res.ok) return
        const json = (await res.json()) as { seasons: Season[] }
        if (cancelled) return

        const open = json.seasons.filter((s) => s.status === "open")
        setOpenCount(open.length)

        const now = Date.now()
        const futureStarts = open
          .map((s) => (s.startDate ? new Date(s.startDate).getTime() : null))
          .filter((t): t is number => t !== null && t > now)
          .sort((a, b) => a - b)
        if (futureStarts.length > 0) {
          const days = Math.ceil((futureStarts[0] - now) / (1000 * 60 * 60 * 24))
          setNearestDeadlineDays(days)
        }
      } catch {
        // Silent — ribbon will show generic copy
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  if (!mounted || dismissed) return null
  if (typeof window !== "undefined" && shouldHideForPath(window.location.pathname)) return null
  if (openCount === 0) return null // nothing's open — no point pestering

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, "1")
    setDismissed(true)
  }

  let copy = "Now enrolling — Browse open programs"
  if (openCount && openCount > 0) {
    copy = `Now enrolling — ${openCount} program${openCount === 1 ? "" : "s"} open`
    if (nearestDeadlineDays !== null && nearestDeadlineDays <= 14) {
      copy += ` · next starts in ${nearestDeadlineDays} day${nearestDeadlineDays === 1 ? "" : "s"}`
    }
  }

  return (
    <div className="relative bg-primary-bright text-primary-foreground">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3 py-2.5">
          <a
            href="/programs"
            className="group flex-1 min-w-0 inline-flex items-center gap-2 text-sm font-medium tracking-wide truncate"
          >
            <span className="truncate">{copy}</span>
            <ArrowRight className="w-4 h-4 flex-shrink-0 transition-transform duration-300 group-hover:translate-x-0.5" />
          </a>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss"
            className="flex-shrink-0 p-1 -m-1 rounded hover:bg-cream/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
