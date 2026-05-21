"use client";
import React, { type ReactNode } from "react";
import { MapPin, Navigation, type LucideIcon } from "lucide-react";
import { CARD_TYPES, type CardType } from "@/lib/dashboard/card-types";
import { STATUS_BADGE, type StatusTone } from "@/lib/dashboard/dashboard-ui";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DashboardVenueInfo {
  /** e.g. "Field 1 · Aspire Sports — Downtown / OSU" */
  label: string;
  /** Google Maps URL from directionsUrl(); null hides the chip. */
  mapsUrl: string | null;
}

export interface DashboardCardProps {
  /** Event type → icon, hue, eyebrow. Omit for a neutral entity card. */
  type?: CardType;
  /** Larger tile + serif title — use for the single "next" item in a section. */
  hero?: boolean;
  /** Overrides the type's eyebrow; required when `type` is omitted and an eyebrow is wanted. */
  eyebrow?: string;
  title: ReactNode;
  /** The "when" line (date/time/coach). */
  meta?: ReactNode;
  venue?: DashboardVenueInfo;
  status?: { label: string; tone: StatusTone };
  /** Right-side action (a Button/anchor). */
  action?: ReactNode;
  /** Dim text under the badge, e.g. "3 spots left". */
  sideText?: ReactNode;
  /** Icon for a neutral (typeless) card. Ignored when `type` is set. */
  icon?: LucideIcon;
  /** Extra body content below the venue line (notes etc.). */
  children?: ReactNode;
}

// ---------------------------------------------------------------------------
// DashboardCard
// ---------------------------------------------------------------------------

export function DashboardCard({
  type,
  hero = false,
  eyebrow,
  title,
  meta,
  venue,
  status,
  action,
  sideText,
  icon: IconProp,
  children,
}: DashboardCardProps): React.JSX.Element {
  const cfg = type ? CARD_TYPES[type] : null;

  // Outer card classes
  const outerCls = cn(
    "flex items-start gap-3 rounded-xl border border-border border-l-4 p-3",
    cfg
      ? [cfg.edge, cfg.tint]
      : ["border-l-border", "bg-cream-2"],
  );

  // Icon tile classes
  const tileSizeCls = hero ? "w-[46px] h-[46px]" : "w-10 h-10";
  const tileCls = cn(
    tileSizeCls,
    "rounded-[11px] flex items-center justify-center shrink-0",
    cfg ? cfg.tile : "bg-cream-3 text-ink-muted",
  );

  // Eyebrow
  const eyebrowLabel = eyebrow ?? cfg?.eyebrow;
  const eyebrowCls = cn(
    "text-[9px] font-bold tracking-[0.13em] uppercase mb-0.5",
    cfg ? cfg.accentText : "text-ink-muted",
  );

  // Title
  const titleCls = hero
    ? "font-display text-xl text-ink leading-[1.15] mt-px"
    : "font-semibold text-sm text-ink";

  // Directions chip + MapPin accent color
  const dirChipCls = cn(
    "inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 border no-underline",
    cfg ? [cfg.accentText, cfg.accentBorder] : "border-border text-ink-2",
  );
  const pinCls = cfg ? cfg.accentText : "text-ink-muted";

  // Rendered icon
  const TileIcon = cfg ? cfg.icon : IconProp;

  return (
    <div className={outerCls}>
      {/* Icon tile */}
      {TileIcon && (
        <div className={tileCls}>
          <TileIcon size={20} aria-hidden={true} />
        </div>
      )}

      {/* Main body */}
      <div className="flex-1 min-w-0">
        {eyebrowLabel && (
          <p className={eyebrowCls}>{eyebrowLabel}</p>
        )}

        <div className={titleCls}>{title}</div>

        {meta && (
          <div className="text-xs text-ink-2 mt-1">{meta}</div>
        )}

        {/* Venue row */}
        {venue && (
          <div className={cn("flex items-center gap-1.5 flex-wrap mt-1.5", pinCls)}>
            <MapPin className="w-3 h-3 shrink-0" aria-hidden={true} />
            <span className="text-[11px] text-ink-2">{venue.label}</span>
            {venue.mapsUrl !== null && (
              <a
                href={venue.mapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={dirChipCls}
              >
                <Navigation className="w-2.5 h-2.5" aria-hidden={true} />
                Directions
              </a>
            )}
          </div>
        )}

        {children}
      </div>

      {/* Right side: badge + action/sideText */}
      {(status || action || sideText) && (
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {status && (
            <span
              className={cn(
                "text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border whitespace-nowrap",
                STATUS_BADGE[status.tone],
              )}
            >
              {status.label}
            </span>
          )}
          {action}
          {sideText && (
            <span className="text-[11px] text-ink-muted">{sideText}</span>
          )}
        </div>
      )}
    </div>
  );
}
