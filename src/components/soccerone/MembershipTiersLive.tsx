"use client";

import { useState } from "react";
import { toast } from "sonner";
import { MembershipTier } from "@/components/soccerone/MembershipTier";

interface TierRow {
  id: string;
  name: string;
  monthlyPriceCents: number | null;
  annualPriceCents: number | null;
  benefits: Record<string, unknown>;
  displayOrder: number;
}

interface Props {
  tiers: TierRow[];
  authed: boolean;
}

function fmtDollars(cents: number | null): string {
  if (cents === null) return "—";
  const d = Math.round(cents / 100);
  return `$${d.toLocaleString()}`;
}

/**
 * Tier row → MembershipTier prop shape. We keep this purely visual — the
 * card content (benefit list, testimonial) is still hand-curated per tier
 * in the marketing page; this wrapper supplies pricing + the wired CTA.
 *
 * Since the marketing copy is editorial (testimonials, lush benefit
 * descriptions), we render the SAME three MembershipTier blocks as
 * before but read price + the wired-up CTA from the live tier rows
 * matched by name. Unmatched tiers fall back to a "no live pricing" CTA.
 */
export function MembershipTiersLive({ tiers, authed }: Props) {
  const [submitting, setSubmitting] = useState<string | null>(null);

  async function subscribe(tierId: string, billingInterval: "month" | "year") {
    if (!authed) {
      window.location.href = `/signin?redirect=${encodeURIComponent("/memberships")}`;
      return;
    }
    setSubmitting(tierId);
    try {
      const res = await fetch("/api/memberships/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tierId, billingInterval }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const body = await res.json();
      window.location.href = body.checkoutUrl;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start checkout");
      setSubmitting(null);
    }
  }

  // Build a name → tier lookup so the editorial blocks below can resolve
  // their prices + ids from the live rows.
  const byName = new Map(tiers.map((t) => [t.name, t]));
  const dayPass = byName.get("Day Pass");
  const member = byName.get("Member");
  const founder = byName.get("Founder");

  return (
    <>
      <MembershipTier
        name="Day Pass"
        monthlyPrice={fmtDollars(dayPass?.monthlyPriceCents ?? null)}
        annualPrice={fmtDollars(dayPass?.annualPriceCents ?? dayPass?.monthlyPriceCents ?? null)}
        ctaLabel={submitting === dayPass?.id ? "Starting…" : "Buy a Day Pass"}
        highlighted={false}
        accentColor="#67e8f9"
        benefits={[
          { text: "Full facility access for the day", included: true },
          { text: "Join any open pickup game", included: true },
          { text: "Works at any SoccerOne location", included: true },
          { text: "Locker room + amenities", included: true },
          { text: "10% off hourly field rental", included: false },
          { text: "Priority league registration", included: false },
          { text: "Guest passes (per month)", included: false },
          { text: "Members-only pickup events", included: false },
        ]}
        testimonial={{
          quote: "Perfect for when I'm in town visiting. Walk in, play, done.",
          author: "Derek T.",
          since: "Day Pass regular",
        }}
        onCta={dayPass ? () => subscribe(dayPass.id, "month") : undefined}
      />

      <MembershipTier
        name="Member"
        monthlyPrice={fmtDollars(member?.monthlyPriceCents ?? null)}
        annualPrice={fmtDollars(member?.annualPriceCents ?? null)}
        annualSaving="17%"
        ctaLabel={submitting === member?.id ? "Starting…" : "Start Member Plan"}
        highlighted={true}
        accentColor="#a3e635"
        benefits={[
          { text: "All facilities — Worthington + Downtown + future", included: true },
          { text: "Unlimited facility access", included: true },
          { text: "Priority league registration (48h early)", included: true },
          { text: "10% off hourly field rentals ($72/hr)", included: true },
          { text: "Members-only pickup events", included: true },
          { text: "Locker room + amenities", included: true },
          { text: "1 guest pass per month", included: false },
          { text: "Free pickup games included monthly", included: false },
        ]}
        testimonial={{
          quote: "Pays for itself in two field rentals. The early league signup is clutch.",
          author: "Maria C.",
          since: "2025",
        }}
        onCta={member ? () => subscribe(member.id, "month") : undefined}
      />

      <MembershipTier
        name="Founder"
        monthlyPrice={fmtDollars(founder?.monthlyPriceCents ?? null)}
        annualPrice={fmtDollars(founder?.annualPriceCents ?? null)}
        annualSaving="17%"
        ctaLabel={submitting === founder?.id ? "Starting…" : "Join as a Founder"}
        highlighted={false}
        accentColor="#fbbf24"
        benefits={[
          { text: "All facilities — chain-wide, forever", included: true },
          { text: "Unlimited pickup games (free)", included: true },
          { text: "First access to league registration (72h early)", included: true },
          { text: "20% off hourly field rentals ($64/hr)", included: true },
          { text: "Founder-only pickup events", included: true },
          { text: "2 guest passes per month", included: true },
          { text: "Name on the Founder wall (lobby)", included: true },
          { text: "30-day advance booking window", included: true },
        ]}
        testimonial={{
          quote: "I train here three times a week. Founder membership made this my second home.",
          author: "James R.",
          since: "2024 — Original Founder",
        }}
        onCta={founder ? () => subscribe(founder.id, "month") : undefined}
      />
    </>
  );
}
