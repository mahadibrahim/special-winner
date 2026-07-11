"use client"

/**
 * NeedsAttentionQueue — right-rail action queue for the Venue Command Center.
 *
 * Receives `groups` from `groupAttention(payload.attention)` and renders each
 * group with a header + count badge, rows with inline action buttons, and a
 * "See all N" collapse for groups longer than PREVIEW_COUNT.
 *
 * Action mapping (per brief):
 *   waiver  → Send link  (primary)
 *   photo   → Capture
 *   ref     → Assign     (primary)
 *   request → Review
 *   message → Open
 */

import { useState } from "react"
import { attentionTotal } from "@/lib/venue/group-attention"
import { attentionActionTarget } from "@/lib/venue/attention-action"
import { EmptyState } from "@/components/ui/empty-state"
import type { VenueAttentionItem } from "@/lib/venue/today-types"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AttentionGroup {
  key: VenueAttentionItem["kind"]
  label: string
  count: number
  items: VenueAttentionItem[]
}

interface Props {
  groups: AttentionGroup[]
  onAction: (item: VenueAttentionItem) => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Max rows shown before "See all N" collapse link appears */
const PREVIEW_COUNT = 2

/** Action button label per kind */
const ACTION_LABEL: Record<VenueAttentionItem["kind"], string> = {
  waiver:  "Send link",
  photo:   "Capture",
  ref:     "Assign",
  request: "Review",
  message: "Open",
}

/** Whether the action should use the primary (ink) style */
const ACTION_PRIMARY: Record<VenueAttentionItem["kind"], boolean> = {
  waiver:  true,
  photo:   false,
  ref:     true,
  request: false,
  message: false,
}

/** Badge colour per kind: amber for waiver/photo, rose for ref, ink for the rest */
function badgeClass(key: VenueAttentionItem["kind"]): string {
  if (key === "waiver" || key === "photo") return "bg-amber-700"
  if (key === "ref")                       return "bg-rose-700"
  return "bg-[#1c1a17]"
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ActionButton({
  kind,
  onClick,
}: {
  kind: VenueAttentionItem["kind"]
  onClick: () => void
}) {
  const label   = ACTION_LABEL[kind]
  const primary = ACTION_PRIMARY[kind]

  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        flex-shrink-0 text-xs px-2.5 py-1.5 rounded-lg border font-bold whitespace-nowrap
        transition-colors
        ${
          primary
            ? "bg-[#1c1a17] text-[#fffdf8] border-[#1c1a17] hover:opacity-90"
            : "bg-[#f6f1e7] text-[#1c1a17] border-[#e4ddcf] hover:border-[#4b463e]"
        }
      `}
    >
      {label}
    </button>
  )
}

// ─── Group ────────────────────────────────────────────────────────────────────

function AttentionGroupSection({
  group,
  onAction,
}: {
  group: AttentionGroup
  onAction: (item: VenueAttentionItem) => void
}) {
  const [expanded, setExpanded] = useState(false)

  const visible = expanded ? group.items : group.items.slice(0, PREVIEW_COUNT)

  return (
    <div className="px-3.5 py-2.5 border-b border-[#efe9dc] last:border-b-0">
      {/* Group header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="font-bold text-[13.5px] text-[#1c1a17]">{group.label}</span>
        <span
          className={`text-[11px] font-extrabold text-white rounded-full px-2 py-px ${badgeClass(group.key)}`}
        >
          {group.count}
        </span>
      </div>

      {/* Rows */}
      {visible.map((item, i) => (
        <div
          key={item.id}
          className={`flex items-center gap-2.5 py-1.5 ${
            i > 0 ? "border-t border-[#efe9dc]" : ""
          }`}
        >
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-[13.5px] text-[#1c1a17] truncate">
              {item.title}
            </div>
            <div className="text-[11.5px] text-[#8a8175] truncate">{item.subtitle}</div>
          </div>
          {attentionActionTarget(item) !== null && (
            <ActionButton kind={item.kind} onClick={() => onAction(item)} />
          )}
        </div>
      ))}

      {/* See all / collapse */}
      {group.count > PREVIEW_COUNT && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="block w-full text-center text-xs font-semibold text-[#4b463e] hover:text-[#1c1a17] pt-1.5 pb-0.5"
        >
          {expanded ? "See less ›" : `See all ${group.count} ›`}
        </button>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function NeedsAttentionQueue({ groups, onAction }: Props) {
  const total = attentionTotal(groups.flatMap((g) => g.items))

  return (
    <div className="bg-[#fffdf8] border border-[#e4ddcf] rounded-2xl overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[#e4ddcf]">
        <h2 className="text-[15px] font-bold text-[#1c1a17] m-0">Needs attention</h2>
        {total > 0 && (
          <span className="text-[11px] font-extrabold text-white bg-[#1c1a17] rounded-full px-2 py-px">
            {total}
          </span>
        )}
      </div>

      {/* Empty state */}
      {groups.length === 0 && (
        <EmptyState
          title="All clear"
          description="Nothing needs attention right now."
          className="py-8"
        />
      )}

      {/* Groups */}
      {groups.map((group) => (
        <AttentionGroupSection key={group.key} group={group} onAction={onAction} />
      ))}
    </div>
  )
}
