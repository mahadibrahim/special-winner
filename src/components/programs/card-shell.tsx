"use client"

import type { ReactNode } from "react"

/**
 * Shared structural shell for every league/program/pickup card — the
 * canonical 8-row contract (media band, title, meta rows A-C, fixed chip
 * slot, spacer, footer) from
 * docs/superpowers/plans/2026-07-23-card-system-consolidation.md.
 * `ProgramCardV2` and the pickup card both render through this so grid
 * alignment holds by construction rather than by convention (same media
 * height, same title clamp, same chip-slot reservation).
 *
 * Each business component owns its own field-derivation logic (season vs.
 * drop-in session have unrelated shapes) and only hands the shell finished
 * content nodes — `mediaBottomLeft`/`mediaTopRight` are fully-styled elements
 * (the badge treatment differs per card kind: status pill vs. static
 * "Pickup" pill), and `footer` is the entire price/CTA (or interest-form)
 * band, since its internal layout varies by signup mode.
 *
 * Whole-card navigation comes from the STRETCHED-LINK pattern (a consumer
 * marks its primary CTA anchor with STRETCHED_LINK_CLASSES), never from an
 * anchor root — an anchor root cannot nest the venue link and would
 * reintroduce the tap-through bug this shell exists to prevent.
 */
export interface CardShellProps {
  /** Defaults to "program-card" — every card in the family shares one testid. */
  testId?: string
  sportColor: string
  mediaBottomLeft: ReactNode
  mediaTopRight: ReactNode
  title: ReactNode
  metaA: ReactNode
  metaB: ReactNode
  metaC: ReactNode
  /** Fixed-height slot (`min-h-[1.375rem]`) — format/early-bird chips for
   *  league cards, skill badge for pickup. Renders empty but present when
   *  there's nothing to show, so row height never varies by chip count. */
  chip?: ReactNode
  footer: ReactNode
}

function CardBody({
  sportColor,
  mediaBottomLeft,
  mediaTopRight,
  title,
  metaA,
  metaB,
  metaC,
  chip,
  footer,
}: Omit<CardShellProps, "testId">) {
  return (
    <>
      {/* Media slot — sport-color fallback block, fixed height across every
          card variant so grids align regardless of card kind. */}
      <div
        className="relative h-28 flex-shrink-0"
        style={{
          // `${sportColor}cc` appends hex alpha (80%) — assumes sportColor is
          // a 6-digit hex, true for every fallback/tint table in use.
          background: `linear-gradient(135deg, ${sportColor}, ${sportColor}cc)`,
        }}
      >
        {mediaBottomLeft}
        {mediaTopRight}
      </div>

      {/* Body */}
      <div className="flex flex-col flex-1 p-4">
        {/* 1 · What — heading, reserved 2-line height */}
        <h3 className="font-display text-base leading-tight text-ink line-clamp-2 min-h-[2.5rem]">
          {title}
        </h3>

        {/* 2-4 · Meta rows A-C — always render, never omitted */}
        <div className="flex items-center gap-1.5 text-xs text-ink-muted mt-2">{metaA}</div>
        <div className="flex items-center gap-1.5 text-xs text-ink-muted mt-1">{metaB}</div>
        <div className="flex items-center gap-1.5 text-xs text-ink-muted mt-1">{metaC}</div>

        {/* 5 · Fixed-height chip slot */}
        <div className="mt-2 min-h-[1.375rem] flex items-center gap-1.5">{chip}</div>

        {/* Spacer pushes price + CTA to a consistent bottom band */}
        <div className="flex-1 min-h-[0.75rem]" />

        {/* 6-7 · Price band + CTA (or interest/waitlist form) — caller-owned */}
        {footer}
      </div>
    </>
  )
}

const ROOT_CLASSES =
  "group relative h-full flex flex-col bg-paper border border-border rounded-2xl overflow-hidden transition-all hover:border-primary/40 hover:-translate-y-0.5"

/**
 * Applied to a card's PRIMARY CTA anchor to make its hit area cover the
 * whole card (stretched-link pattern) — an accessible alternative to a div
 * onClick that keeps the CTA a real, keyboard-reachable, screen-reader
 * announced link. Relies on `ROOT_CLASSES` giving the card root
 * `position: relative` as the containing block for this `::after`.
 *
 * Any OTHER interactive element inside the same card (nested links,
 * secondary CTAs, form inputs) must add `relative z-10` so it paints above
 * this overlay — see `venue-link.tsx` for the reference implementation.
 * Do not apply this class in a footer branch that renders a form (interest
 * capture / waitlist) — those states have no primary navigation to stretch.
 */
export const STRETCHED_LINK_CLASSES = "after:absolute after:inset-0 after:content-['']"

export function CardShell({ testId = "program-card", ...body }: CardShellProps) {
  return (
    <div data-testid={testId} className={ROOT_CLASSES}>
      <CardBody {...body} />
    </div>
  )
}
