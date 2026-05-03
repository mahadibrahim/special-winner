"use client"

import { Camera } from "lucide-react"
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

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-ink mb-2">Media Authorization</h3>
        <p className="text-ink-muted text-sm">
          Choose how Aspire Sports may use {subjectLabel}. All three are
          enabled by default — uncheck any you don't want to allow. You can
          change these at any time from your dashboard.
        </p>
      </div>

      <div className="space-y-3">
        {SCOPES.map((scope) => {
          const isGranted = !optOutScopes.has(scope.id)
          return (
            <div
              key={scope.id}
              className="p-4 rounded-xl border border-border bg-cream-2 flex items-start gap-3"
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
                  className="text-sm font-medium text-ink cursor-pointer flex items-center gap-2"
                >
                  <Camera className="w-4 h-4 text-primary" />
                  {scope.title}
                </Label>
                <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                  {scope.description}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      <div className="text-xs text-ink-faint">
        Aspire Sports will not use {subjectLabel} for any purpose you've
        unchecked. To withdraw consent later, visit your dashboard and use
        "Manage consent" on the participant's profile.
      </div>
    </div>
  )
}
