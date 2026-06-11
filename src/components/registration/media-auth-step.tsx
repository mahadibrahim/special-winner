"use client"

import { useState } from "react"
import { Camera, ChevronDown } from "lucide-react"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

export type MediaAuthScope = "internal" | "promotional" | "public"

export interface MediaAuthStepProps {
  /** Whether the registrant is registering themselves (vs. a child) */
  isSelf: boolean
  /** Display name of the participant (for copy clarity) */
  participantName: string
  /** Set of scopes the user has explicitly opted OUT of. Empty = all 3 granted. */
  optOutScopes: ReadonlySet<MediaAuthScope>
  onOptOutScopesChange: (next: ReadonlySet<MediaAuthScope>) => void
}

const SCOPES: ReadonlyArray<{
  id: MediaAuthScope
  title: string
  description: string
}> = [
  {
    id: "internal",
    title: "Internal use",
    description:
      "Team rosters, coach-shared galleries, and parent-only end-of-season recap pages.",
  },
  {
    id: "promotional",
    title: "Promotional materials",
    description:
      "Aspire Sports website, brochures, social media posts, and recruiting materials produced by the organization.",
  },
  {
    id: "public",
    title: "Public / press",
    description:
      "Press releases, partner-organization sharing, and other public-facing materials beyond the organization's own channels.",
  },
]

export function MediaAuthStep({
  isSelf,
  participantName,
  optOutScopes,
  onOptOutScopesChange,
}: MediaAuthStepProps) {
  // Media consent is non-blocking and grants all three scopes by default, so
  // it sits below the waiver as a collapsed, clearly-optional section — there
  // when a customer wants it, out of the way when they don't.
  const [expanded, setExpanded] = useState(false)

  function toggle(scope: MediaAuthScope) {
    const next = new Set(optOutScopes)
    if (next.has(scope)) {
      next.delete(scope)
    } else {
      next.add(scope)
    }
    onOptOutScopesChange(next)
  }

  const subjectLabel = isSelf
    ? "your photos and videos"
    : `photos and videos of ${participantName}`

  const grantedCount = SCOPES.length - optOutScopes.size
  const summary =
    optOutScopes.size === 0
      ? "All uses allowed"
      : grantedCount === 0
        ? "No uses allowed"
        : `${grantedCount} of ${SCOPES.length} uses allowed`

  return (
    <div className="rounded-xl border border-border bg-cream-2 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((o) => !o)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
      >
        <Camera className="w-4 h-4 text-primary flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-ink">
            Photo &amp; video permissions{" "}
            <span className="text-ink-faint font-normal">(optional)</span>
          </p>
          <p className="text-xs text-ink-muted">{summary} · tap to adjust</p>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-ink-muted transition-transform ${expanded ? "rotate-180" : ""}`}
        />
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border pt-3 space-y-3">
          <p className="text-xs text-ink-muted">
            Choose how Aspire Sports may use {subjectLabel}. All three are
            enabled by default — uncheck any you don't want to allow. You can
            change these at any time from your dashboard.
          </p>

          {SCOPES.map((scope) => {
            const isGranted = !optOutScopes.has(scope.id)
            return (
              <div
                key={scope.id}
                className="p-3 rounded-lg border border-border bg-paper flex items-start gap-3"
              >
                <Checkbox
                  id={`media-auth-${scope.id}`}
                  checked={isGranted}
                  onCheckedChange={() => toggle(scope.id)}
                  className="mt-1 border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                />
                <div className="flex-1">
                  <Label
                    htmlFor={`media-auth-${scope.id}`}
                    className="text-sm font-medium text-ink cursor-pointer"
                  >
                    {scope.title}
                  </Label>
                  <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                    {scope.description}
                  </p>
                </div>
              </div>
            )
          })}

          <p className="text-xs text-ink-faint">
            Aspire Sports will not use {subjectLabel} for any purpose you've
            unchecked. To withdraw consent later, visit your dashboard and use
            "Manage consent" on the participant's profile.
          </p>
        </div>
      )}
    </div>
  )
}
