"use client";
import React from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExploreCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  href: string;
  cta: string;
  /** cross-sell card → sage treatment; default → primary. */
  variant?: "default" | "cross-sell";
  target?: string;
}

// ---------------------------------------------------------------------------
// ExploreCard
// ---------------------------------------------------------------------------

export function ExploreCard({
  icon: Icon,
  title,
  description,
  href,
  cta,
  variant = "default",
  target,
}: ExploreCardProps): React.JSX.Element {
  const isCrossSell = variant === "cross-sell";

  const linkProps = target
    ? { target, rel: "noopener noreferrer" }
    : {};

  const cardCls = cn(
    "group block rounded-xl border p-3.5 transition-colors",
    isCrossSell
      ? "border-sage/30 bg-sage/[0.06] hover:bg-sage/[0.10]"
      : "border-border bg-cream-2 hover:bg-cream-3",
  );

  const tileCls = cn(
    "w-[30px] h-[30px] rounded-lg flex items-center justify-center mb-2 shrink-0",
    isCrossSell ? "bg-sage text-cream" : "bg-primary-bright text-primary-foreground",
  );

  const titleCls = cn(
    "text-[13px] font-semibold",
    isCrossSell ? "text-sage" : "text-ink",
  );

  const ctaCls = cn(
    "inline-flex items-center gap-1 text-[11px] font-semibold mt-2",
    isCrossSell ? "text-sage" : "text-primary",
  );

  return (
    <a href={href} className={cardCls} {...linkProps}>
      {/* Icon tile */}
      <div className={tileCls}>
        <Icon size={15} aria-hidden={true} />
      </div>

      {/* Title */}
      <p className={titleCls}>{title}</p>

      {/* Description */}
      <p className="text-[11px] text-ink-muted leading-relaxed mt-0.5">
        {description}
      </p>

      {/* CTA row */}
      <span className={ctaCls}>
        {cta}
        <ArrowRight
          size={11}
          aria-hidden={true}
          className="transition-transform group-hover:translate-x-0.5"
        />
      </span>
    </a>
  );
}
