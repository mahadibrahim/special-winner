"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { Sparkles } from "lucide-react"

interface CoachNote {
  id: string
  familyMemberId: string
  category: string
  title: string | null
  content: string
  createdAt: string
}

interface RecentGlowsProps {
  familyMemberId: string
  className?: string
}

const GLOW_CATEGORIES = new Set(["achievement", "encouragement"])
const GLOW_LIMIT = 5

/**
 * Compact strip of the athlete's 5 most recent "glow" coach notes
 * (category achievement/encouragement) — a quick hit of positive framing
 * above the domain cards. Fails soft: renders nothing on error or when
 * there are no glow notes for this child, so it never blocks the rest of
 * the development report.
 */
export default function RecentGlows({ familyMemberId, className }: RecentGlowsProps) {
  const [glows, setGlows] = useState<CoachNote[]>([])

  useEffect(() => {
    let cancelled = false

    async function fetchGlows() {
      try {
        const res = await fetch("/api/family/coach-notes?limit=30")
        if (!res.ok) return
        const json = await res.json()
        const notes: CoachNote[] = Array.isArray(json?.notes) ? json.notes : []
        const filtered = notes
          .filter((n) => n.familyMemberId === familyMemberId && GLOW_CATEGORIES.has(n.category))
          .slice(0, GLOW_LIMIT)
        if (!cancelled) setGlows(filtered)
      } catch {
        // Fail-soft — this strip is a bonus, not core report data.
      }
    }

    fetchGlows()
    return () => {
      cancelled = true
    }
  }, [familyMemberId])

  if (glows.length === 0) return null

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {glows.map((glow) => (
        <span
          key={glow.id}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 text-emerald-600 text-sm"
        >
          <Sparkles className="w-3.5 h-3.5 shrink-0" />
          <span className="line-clamp-1 ph-mask">{glow.title || glow.content}</span>
        </span>
      ))}
    </div>
  )
}
