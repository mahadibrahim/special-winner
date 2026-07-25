"use client"

import type { CSSProperties, ReactNode } from "react"

/**
 * SoCard — the shared dark-card primitive for SoccerOne surfaces.
 *
 * Before this file, three SoccerOne surfaces each hand-rolled their own dark
 * card idiom with duplicated badge/status-pill/price-row/title anatomy:
 * LeagueCard (SoccerOneLeaguesFinder.tsx), GameCard (PickupGames.tsx), and
 * MembershipTier (MembershipTier.tsx). None of them clamped their title —
 * `.lc-name` / `.pgc-name` grew as tall as the content, so cards in the same
 * grid row went ragged. This file is the single style source for that
 * anatomy: call sites import the pieces they need (`SoCardShell`,
 * `SoCardTitle`, `SoBadge`, `SoStatusPill`, `SoPriceRow`) and render
 * `<SoCardStyles />` once per page (not once per card instance — the old
 * `PickupGames.tsx` GameCard rendered its own `<style>` block inside every
 * card, duplicating identical CSS text once per session on the page).
 *
 * Idiom-specific layout (grids, detail rows, benefit lists, CTA buttons,
 * scroll rows) stays local to each call-site file — only the anatomy common
 * across idioms (shell, badge, status pill, price row, clamped title) lives
 * here.
 *
 * Brand-separate by design: `--so-*` tokens only, no shared component with
 * the Aspire card family (`src/components/programs/program-card-v2.tsx`).
 * Cream-idiom tokens invert illegibly on SoccerOne's navy surface, so this
 * file must never import from `src/components/programs/**` or vice versa.
 */

export type SoCardBase = "league" | "pickup" | "tier"

export function SoCardShell({
  variant,
  modifier,
  children,
  style,
  className = "",
}: {
  variant: SoCardBase
  /** Sub-variant applied as `so-card-{variant}-{modifier}` alongside the
   * base `so-card-{variant}` rules (e.g. variant="league" modifier="downtown"
   * → "so-card-league so-card-league-downtown"). */
  modifier?: string
  children: ReactNode
  style?: CSSProperties
  className?: string
}) {
  const classes = ["so-card", `so-card-${variant}`]
  if (modifier) classes.push(`so-card-${variant}-${modifier}`)
  if (className) classes.push(className)
  return (
    <div className={classes.join(" ")} style={style}>
      {children}
    </div>
  )
}

export function SoCardTitle({
  variant,
  children,
}: {
  variant: "league" | "pickup"
  children: ReactNode
}) {
  return <h3 className={`so-card-name so-card-name-${variant}`}>{children}</h3>
}

export type SoBadgeKind = "tag" | "tag-downtown" | "outline" | "skill"

export function SoBadge({
  kind,
  children,
  style,
}: {
  kind: SoBadgeKind
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <span className={`so-badge-${kind}`} style={style}>
      {children}
    </span>
  )
}

export type SoStatusTone = "open" | "filling" | "coming" | "urgent"

export function SoStatusPill({
  tone,
  children,
}: {
  tone: SoStatusTone
  children: ReactNode
}) {
  return <span className={`so-status-${tone}`}>{children}</span>
}

export function SoPriceRow({ children }: { children: ReactNode }) {
  return <div className="so-price-row">{children}</div>
}

/**
 * The single style source for the anatomy above. Render once per page
 * (section-level), not once per card — repeating this per card instance
 * (the old GameCard pattern) duplicates identical CSS text in the DOM once
 * per rendered card.
 */
export function SoCardStyles() {
  return (
    <style>{`
      /* ---- shell ---- */
      .so-card {
        display: flex;
        flex-direction: column;
        position: relative;
      }

      .so-card-league {
        background: var(--so-surface);
        border: 1px solid var(--so-lime-a20);
        border-left: 3px solid var(--so-lime);
        border-radius: var(--so-radius-lg);
        padding: 1.75rem;
        gap: 1rem;
        transition: border-color 0.2s, transform 0.2s;
      }
      .so-card-league:hover { border-color: var(--so-lime-a40); border-left-color: var(--so-lime); transform: translateY(-4px); }
      .so-card-league-active { border-color: var(--so-lime-a15); }
      .so-card-league-downtown { border-color: rgba(100,160,255,0.2); border-left-color: rgba(100,160,255,0.8); }
      .so-card-league-downtown:hover { border-color: rgba(100,160,255,0.4); border-left-color: rgba(100,160,255,1); }
      .so-card-league-youth { border-color: rgba(192,132,252,0.2); border-left-color: rgba(192,132,252,0.8); }

      .so-card-pickup {
        border-width: 1.5px;
        border-style: solid;
        border-radius: var(--so-radius-xl);
        padding: 1.25rem;
        gap: 0.875rem;
        min-width: 260px;
        max-width: 340px;
        transition: transform 0.2s;
        font-family: var(--so-font-body);
      }
      .so-card-pickup:hover { transform: translateY(-2px); }

      .so-card-tier {
        background: var(--so-navy-raised);
        border: 1.5px solid rgba(255,255,255,0.1);
        border-radius: var(--so-radius-xl);
        padding: 2rem;
        gap: 1.5rem;
        font-family: var(--so-font-body);
        transition: border-color 0.2s, transform 0.2s;
      }
      .so-card-tier:hover { border-color: rgba(250,204,21,0.3); transform: translateY(-2px); }
      .so-card-tier-highlighted {
        border-color: var(--tier-accent);
        background: #0e2540;
        box-shadow: 0 0 0 1px var(--tier-accent), 0 8px 32px rgba(250,204,21,0.12);
      }

      /* ---- title: clamped + reserved height (the alignment fix) ---- */
      .so-card-name {
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
        word-break: break-word;
        margin: 0;
      }
      .so-card-name-league {
        font-family: var(--so-font-display);
        font-size: 1.75rem;
        color: #ffffff;
        letter-spacing: 0.01em;
        line-height: 1.15;
        min-height: calc(1.15em * 2);
      }
      .so-card-name-pickup {
        font-family: var(--so-font-body);
        font-size: 1rem;
        font-weight: 700;
        color: #ffffff;
        line-height: 1.25;
        min-height: calc(1.25em * 2);
      }

      /* ---- badges ---- */
      .so-badge-tag, .so-badge-tag-downtown, .so-badge-outline, .so-badge-skill {
        display: inline-block;
        width: fit-content;
      }
      .so-badge-tag {
        font-family: var(--so-font-mono);
        font-size: 0.5rem;
        font-weight: 600;
        letter-spacing: 0.12em;
        background: var(--so-lime-a08);
        color: var(--so-lime-a60);
        border: 1px solid var(--so-lime-a15);
        padding: 2px 7px;
        border-radius: 3px;
      }
      .so-badge-tag-downtown {
        font-family: var(--so-font-mono);
        font-size: 0.5rem;
        font-weight: 600;
        letter-spacing: 0.12em;
        background: rgba(100,160,255,0.08);
        color: rgba(147,197,253,0.7);
        border: 1px solid rgba(100,160,255,0.15);
        padding: 2px 7px;
        border-radius: 3px;
      }
      .so-badge-outline {
        font-family: var(--so-font-mono);
        font-size: 0.55rem;
        letter-spacing: 0.08em;
        color: var(--so-lime);
        border: 1px solid var(--so-lime-a30);
        border-radius: 99px;
        padding: 2px 7px;
      }
      .so-badge-skill {
        font-family: var(--so-font-body);
        font-size: 0.6875rem;
        font-weight: 700;
        letter-spacing: 0.09em;
        text-transform: uppercase;
        padding: 3px 10px;
        border-radius: var(--so-radius-pill);
      }

      /* ---- status pills ---- */
      .so-status-open, .so-status-filling, .so-status-coming {
        font-family: var(--so-font-mono);
        font-size: 0.5rem;
        font-weight: 600;
        letter-spacing: 0.1em;
        padding: 3px 8px;
        border-radius: 3px;
        flex-shrink: 0;
      }
      .so-status-open { background: var(--so-lime-a12); color: var(--so-lime); border: 1px solid var(--so-lime-a20); }
      .so-status-filling { background: rgba(251,191,36,0.1); color: #fbbf24; border: 1px solid rgba(251,191,36,0.2); }
      .so-status-coming { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.4); border: 1px solid rgba(255,255,255,0.1); }
      .so-status-urgent {
        font-family: var(--so-font-body);
        font-size: 0.6875rem;
        font-weight: 700;
        letter-spacing: 0.06em;
        color: #f97316;
        background: rgba(249,115,22,0.15);
        padding: 3px 8px;
        border-radius: var(--so-radius-pill);
        text-transform: uppercase;
        flex-shrink: 0;
      }

      /* ---- price row ---- */
      .so-price-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.5rem;
      }
    `}</style>
  )
}
