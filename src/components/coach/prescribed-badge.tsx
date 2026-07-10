"use client"

import { cn } from "@/lib/utils"

/**
 * "Program plan" badge (Program Blueprint T9). See "The coach seam" in
 * docs/superpowers/specs/2026-07-10-program-blueprint-design.md:
 *
 *   "Prescribed sessions carry a badge on the practices list, schedule,
 *   and session detail: 'Program plan · from {director first name}'.
 *   Wording warm, never 'locked' — coaches edit exactly as their own
 *   sessions."
 *
 * A shared, tiny component (not folded into each page's own status Badge)
 * so the three call sites — practices-overview.tsx, coach-schedule.tsx,
 * session-detail.tsx — render byte-identical copy and styling. Cream
 * tokens, deliberately quiet: informative, not a restriction indicator.
 *
 * Renders nothing when `prescribed` is null/undefined (an ordinary,
 * coach-created session) — call sites can render it unconditionally.
 */
export interface PrescribedInfo {
  attachmentId: string
  distributorFirstName: string | null
}

export function PrescribedBadge({
  prescribed,
  className,
}: {
  prescribed: PrescribedInfo | null | undefined
  className?: string
}) {
  if (!prescribed) return null
  return (
    <span
      data-testid="prescribed-badge"
      className={cn(
        "inline-flex items-center rounded-full border border-border bg-cream-3 px-2 py-0.5 text-[10px] font-medium text-ink-muted whitespace-nowrap",
        className,
      )}
    >
      Program plan{prescribed.distributorFirstName ? ` · from ${prescribed.distributorFirstName}` : ""}
    </span>
  )
}
