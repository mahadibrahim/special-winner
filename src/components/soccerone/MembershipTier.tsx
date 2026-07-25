"use client";

import React from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SoCardShell } from "@/components/soccerone/SoCard";

interface Benefit {
  text: string;
  included: boolean;
}

interface MembershipTierProps {
  name: string;
  /** Formatted price (e.g. "$99") — null when the tier has no live price yet. */
  monthlyPrice: string | null;
  /** Formatted annual price — null hides the annual line entirely. */
  annualPrice: string | null;
  /** Unit shown after the price. Day passes are per-visit, plans per-month. */
  pricePeriod?: "/mo" | "/visit";
  annualSaving?: string;
  benefits: Benefit[];
  testimonial?: {
    quote: string;
    author: string;
    since?: string;
  };
  highlighted?: boolean;
  ctaLabel: string;
  accentColor?: string;
  onCta?: () => void;
}

export function MembershipTier({
  name,
  monthlyPrice,
  annualPrice,
  pricePeriod = "/mo",
  annualSaving,
  benefits,
  testimonial,
  highlighted = false,
  ctaLabel,
  accentColor = "var(--so-tier-gold)",
  onCta,
}: MembershipTierProps) {
  const handleSignup = () => {
    if (onCta) {
      onCta();
      return;
    }
    // Fallback when the tier has no live Stripe price yet (no onCta) —
    // evergreen copy, real contact path.
    toast("This plan isn't open for signup yet", {
      description:
        "Email hello@gosoccerone.com and we'll let you know the moment it opens.",
      duration: 6000,
    });
  };

  return (
    <SoCardShell
      variant="tier"
      modifier={highlighted ? "highlighted" : undefined}
      style={{ "--tier-accent": accentColor } as React.CSSProperties}
    >
      {highlighted && (
        <div className="tier-badge">Most Popular</div>
      )}

      <div className="tier-header">
        <h3 className="tier-name">{name}</h3>
        <div className="tier-pricing">
          {monthlyPrice ? (
            <div className="tier-monthly">
              <span className="price-amount">{monthlyPrice}</span>
              <span className="price-period">{pricePeriod}</span>
            </div>
          ) : (
            <div className="tier-monthly">
              <span className="price-coming">Coming soon</span>
            </div>
          )}
          {annualPrice && (
            <div className="tier-annual">
              <span className="annual-label">or {annualPrice}/yr</span>
              {annualSaving && (
                <span className="annual-saving">Save {annualSaving}</span>
              )}
            </div>
          )}
        </div>
      </div>

      <ul className="tier-benefits">
        {benefits.map((benefit, i) => (
          <li
            key={i}
            className={cn("tier-benefit", !benefit.included && "tier-benefit--excluded")}
          >
            <span className="benefit-icon">
              {benefit.included ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="8" fill="currentColor" opacity="0.15"/>
                  <path d="M4.5 8L7 10.5L11.5 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <circle cx="8" cy="8" r="8" fill="#94a3b8" opacity="0.12"/>
                  <path d="M5.5 10.5L10.5 5.5M5.5 5.5L10.5 10.5" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              )}
            </span>
            <span className="benefit-text">{benefit.text}</span>
          </li>
        ))}
      </ul>

      {testimonial && (
        <blockquote className="tier-testimonial">
          <p className="testimonial-quote">"{testimonial.quote}"</p>
          <footer className="testimonial-author">
            — {testimonial.author}
            {testimonial.since ? `, member since ${testimonial.since}` : ""}
          </footer>
        </blockquote>
      )}

      <button onClick={handleSignup} className="tier-cta">
        {ctaLabel}
      </button>

      <style>{`
        /* Shell (background/border/hover/highlight) now lives in SoCard.tsx
           as .so-card-tier / .so-card-tier-highlighted — this stays a
           shell-only adoption (the plan's pre-authorized fallback): the
           pricing-plan anatomy below (badge ribbon, price block, benefit
           list, testimonial, full-width CTA) is different enough from the
           league/pickup cards' badge/status/price-row shapes that forcing
           it through those shared sub-parts would risk changing this card's
           look, so it stays local. */
        .tier-badge {
          position: absolute;
          top: -14px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--tier-accent, var(--so-tier-gold));
          color: var(--so-navy);
          font-family: var(--so-font-body);
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 4px 14px;
          border-radius: var(--so-radius-pill);
          white-space: nowrap;
        }
        .tier-header {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .tier-name {
          font-family: var(--so-font-body);
          font-size: 1.375rem;
          font-weight: 700;
          color: #ffffff;
          letter-spacing: -0.02em;
          margin: 0;
        }
        .tier-pricing {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .tier-monthly {
          display: flex;
          align-items: baseline;
          gap: 2px;
        }
        .price-amount {
          font-family: var(--so-font-body);
          font-size: 2.5rem;
          font-weight: 800;
          color: var(--tier-accent, var(--so-tier-gold));
          letter-spacing: -0.04em;
          line-height: 1;
        }
        .price-period {
          font-size: 1rem;
          color: rgba(255,255,255,0.5);
          margin-left: 2px;
        }
        .price-coming {
          font-family: var(--so-font-body);
          font-size: 1.375rem;
          font-weight: 700;
          color: rgba(255,255,255,0.55);
          letter-spacing: -0.01em;
          line-height: 1;
          text-transform: uppercase;
        }
        .tier-annual {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .annual-label {
          font-size: 0.875rem;
          color: rgba(255,255,255,0.45);
        }
        .annual-saving {
          font-size: 0.75rem;
          font-weight: 600;
          color: #4ade80;
          background: rgba(74,222,128,0.1);
          padding: 2px 8px;
          border-radius: var(--so-radius-pill);
        }
        .tier-benefits {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 0.625rem;
          flex: 1;
        }
        .tier-benefit {
          display: flex;
          align-items: flex-start;
          gap: 0.625rem;
          color: rgba(255,255,255,0.85);
          font-size: 0.9375rem;
          line-height: 1.4;
        }
        .tier-benefit--excluded {
          color: rgba(255,255,255,0.3);
        }
        .tier-benefit--excluded .benefit-icon {
          color: #64748b;
        }
        .benefit-icon {
          flex-shrink: 0;
          margin-top: 1px;
          color: var(--tier-accent, var(--so-tier-gold));
        }
        .benefit-text {
          flex: 1;
        }
        .tier-testimonial {
          background: rgba(255,255,255,0.04);
          border-left: 3px solid var(--tier-accent, var(--so-tier-gold));
          border-radius: 0 6px 6px 0;
          padding: 0.875rem 1rem;
          margin: 0;
        }
        .testimonial-quote {
          font-size: 0.875rem;
          color: rgba(255,255,255,0.7);
          line-height: 1.55;
          margin: 0 0 0.4rem;
          font-style: italic;
        }
        .testimonial-author {
          font-size: 0.8125rem;
          color: rgba(255,255,255,0.4);
          font-style: normal;
        }
        .tier-cta {
          display: block;
          width: 100%;
          background: var(--tier-accent, var(--so-tier-gold));
          color: var(--so-navy);
          font-family: var(--so-font-body);
          font-size: 0.9375rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          border: none;
          border-radius: var(--so-radius-md);
          padding: 0.875rem;
          cursor: pointer;
          transition: filter 0.15s, transform 0.1s;
          margin-top: auto;
        }
        .tier-cta:hover {
          filter: brightness(1.08);
          transform: translateY(-1px);
        }
        .tier-cta:active {
          transform: translateY(0);
        }
      `}</style>
    </SoCardShell>
  );
}
