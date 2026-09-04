"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBanner } from "@/components/ui/error-banner";
import type { MembershipTier } from "@/lib/db/schema/memberships";

interface TierFormProps {
  tier?: MembershipTier;
}

export default function TierForm({ tier }: TierFormProps) {
  const isEdit = tier !== undefined;

  // Price fields — stored as dollar strings ("" = null)
  const [monthly, setMonthly] = useState<string>(
    tier?.monthlyPriceCents != null ? String(tier.monthlyPriceCents / 100) : "",
  );
  const [annual, setAnnual] = useState<string>(
    tier?.annualPriceCents != null ? String(tier.annualPriceCents / 100) : "",
  );
  const [annualFee, setAnnualFee] = useState<string>(
    tier?.annualFeeCents != null ? String(tier.annualFeeCents / 100) : "",
  );
  const [technicalMonthly, setTechnicalMonthly] = useState<string>(
    tier?.technicalMonthlyCents != null ? String(tier.technicalMonthlyCents / 100) : "",
  );

  // Core fields
  const [name, setName] = useState(tier?.name ?? "");
  const [tagline, setTagline] = useState(tier?.tagline ?? "");
  const [displayOrder, setDisplayOrder] = useState<string>(
    String(tier?.displayOrder ?? 0),
  );
  const [isActive, setIsActive] = useState(tier?.isActive ?? true);

  // Benefit fields — numeric
  const benefits = (tier?.benefits ?? {}) as Record<string, unknown>;
  const [rentalDiscountPct, setRentalDiscountPct] = useState<string>(
    benefits.rental_discount_pct != null ? String(benefits.rental_discount_pct) : "",
  );
  const [freePickupPerMonth, setFreePickupPerMonth] = useState<string>(
    benefits.free_pickup_per_month != null ? String(benefits.free_pickup_per_month) : "",
  );
  const [guestPassesPerMonth, setGuestPassesPerMonth] = useState<string>(
    benefits.guest_passes_per_month != null ? String(benefits.guest_passes_per_month) : "",
  );
  const [bookingWindowDays, setBookingWindowDays] = useState<string>(
    benefits.booking_window_days != null ? String(benefits.booking_window_days) : "",
  );
  const [priorityLeagueSignupHrs, setPriorityLeagueSignupHrs] = useState<string>(
    benefits.priority_league_signup_hrs != null
      ? String(benefits.priority_league_signup_hrs)
      : "",
  );
  const [classesPerMonth, setClassesPerMonth] = useState<string>(
    benefits.classes_per_month != null ? String(benefits.classes_per_month) : "",
  );
  const [campDiscountPct, setCampDiscountPct] = useState<string>(
    benefits.camp_discount_pct != null ? String(benefits.camp_discount_pct) : "",
  );

  // Benefit fields — boolean
  const [unlimitedPickup, setUnlimitedPickup] = useState(
    benefits.unlimited_pickup === true,
  );
  const [membersOnlyPickup, setMembersOnlyPickup] = useState(
    benefits.members_only_pickup === true,
  );
  const [unlimitedClasses, setUnlimitedClasses] = useState(
    benefits.unlimited_classes === true,
  );

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function buildBenefits(): Record<string, number | boolean> {
    const b: Record<string, number | boolean> = {};
    const numericFields: Array<[string, string]> = [
      ["rental_discount_pct", rentalDiscountPct],
      ["free_pickup_per_month", freePickupPerMonth],
      ["guest_passes_per_month", guestPassesPerMonth],
      ["booking_window_days", bookingWindowDays],
      ["priority_league_signup_hrs", priorityLeagueSignupHrs],
      ["classes_per_month", classesPerMonth],
      ["camp_discount_pct", campDiscountPct],
    ];
    for (const [key, raw] of numericFields) {
      const n = Number(raw);
      if (raw !== "" && !Number.isNaN(n) && n >= 0) b[key] = n;
    }
    if (unlimitedPickup) b.unlimited_pickup = true;
    if (membersOnlyPickup) b.members_only_pickup = true;
    if (unlimitedClasses) b.unlimited_classes = true;
    return b;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const url = tier
        ? `/api/admin/memberships/tiers/${tier.id}`
        : "/api/admin/memberships/tiers";
      const method = tier ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          monthlyDollars: monthly === "" ? null : Number(monthly),
          annualDollars: annual === "" ? null : Number(annual),
          annualFeeDollars: annualFee === "" ? null : Number(annualFee),
          technicalMonthlyDollars: technicalMonthly === "" ? null : Number(technicalMonthly),
          tagline: tagline.trim() === "" ? null : tagline.trim(),
          benefits: buildBenefits(),
          displayOrder: Number(displayOrder) || 0,
          isActive,
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError((b as { error?: string }).error ?? "Save failed");
        return;
      }
      window.location.href = "/admin/memberships";
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6 max-w-2xl">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <a
            href="/admin/memberships"
            className="text-xs uppercase tracking-wider text-ink-muted hover:text-ink"
          >
            ← All tiers
          </a>
          <h1 className="text-2xl font-bold text-ink mt-2">
            {isEdit ? tier.name : "New membership tier"}
          </h1>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Active
        </label>
      </header>

      {error && <ErrorBanner message={error} />}

      <div className="space-y-5">
        <h2 className="font-semibold text-ink text-lg">Details</h2>

        <div>
          <Label htmlFor="tier-name">Name</Label>
          <Input
            id="tier-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="monthly-price">Monthly price ($)</Label>
            <Input
              id="monthly-price"
              type="number"
              min="0"
              step="0.01"
              value={monthly}
              onChange={(e) => setMonthly(e.target.value)}
              placeholder="e.g. 29"
            />
          </div>
          <div>
            <Label htmlFor="annual-price">Annual price ($)</Label>
            <Input
              id="annual-price"
              type="number"
              min="0"
              step="0.01"
              value={annual}
              onChange={(e) => setAnnual(e.target.value)}
              placeholder="e.g. 299"
            />
          </div>
        </div>
        <p className="text-xs text-ink-muted -mt-2">
          At least one price must be set. Leave both blank only if you intend to
          configure prices later.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="annual-fee">Annual fee ($/yr)</Label>
            <Input
              id="annual-fee"
              type="number"
              min="0"
              step="0.01"
              value={annualFee}
              onChange={(e) => setAnnualFee(e.target.value)}
              placeholder="e.g. 45"
            />
          </div>
          <div>
            <Label htmlFor="tagline">Tagline</Label>
            <Input
              id="tagline"
              value={tagline}
              maxLength={120}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="e.g. 8 classes a month"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="technical-monthly">Technical supplement ($/month)</Label>
            <Input
              id="technical-monthly"
              type="number"
              min="0"
              step="0.01"
              value={technicalMonthly}
              onChange={(e) => setTechnicalMonthly(e.target.value)}
              placeholder="e.g. 9"
            />
            <p className="text-xs text-ink-muted mt-1">
              Extra monthly charge added per child enrolled in a technical-training
              class slot. Leave blank if this tier doesn&apos;t offer technical
              classes.
            </p>
          </div>
        </div>

        <div>
          <Label htmlFor="display-order">Display order</Label>
          <Input
            id="display-order"
            type="number"
            min="0"
            step="1"
            value={displayOrder}
            onChange={(e) => setDisplayOrder(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-5">
        <h2 className="font-semibold text-ink text-lg">Benefits</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="rental-discount">Rental discount (%)</Label>
            <Input
              id="rental-discount"
              type="number"
              min="0"
              max="100"
              step="1"
              value={rentalDiscountPct}
              onChange={(e) => setRentalDiscountPct(e.target.value)}
              placeholder="e.g. 10"
            />
          </div>
          <div>
            <Label htmlFor="free-pickup">Free pick-up sessions / month</Label>
            <Input
              id="free-pickup"
              type="number"
              min="0"
              step="1"
              value={freePickupPerMonth}
              onChange={(e) => setFreePickupPerMonth(e.target.value)}
              placeholder="e.g. 4"
            />
          </div>
          <div>
            <Label htmlFor="guest-passes">Guest passes / month</Label>
            <Input
              id="guest-passes"
              type="number"
              min="0"
              step="1"
              value={guestPassesPerMonth}
              onChange={(e) => setGuestPassesPerMonth(e.target.value)}
              placeholder="e.g. 2"
            />
          </div>
          <div>
            <Label htmlFor="booking-window">Booking window (days)</Label>
            <Input
              id="booking-window"
              type="number"
              min="0"
              step="1"
              value={bookingWindowDays}
              onChange={(e) => setBookingWindowDays(e.target.value)}
              placeholder="e.g. 14"
            />
          </div>
          <div>
            <Label htmlFor="priority-hrs">Priority league signup (hours)</Label>
            <Input
              id="priority-hrs"
              type="number"
              min="0"
              step="1"
              value={priorityLeagueSignupHrs}
              onChange={(e) => setPriorityLeagueSignupHrs(e.target.value)}
              placeholder="e.g. 48"
            />
          </div>
          <div>
            <Label htmlFor="classes-per-month">Classes / month</Label>
            <Input
              id="classes-per-month"
              type="number"
              min="0"
              step="1"
              value={classesPerMonth}
              onChange={(e) => setClassesPerMonth(e.target.value)}
              placeholder="e.g. 8"
            />
          </div>
          <div>
            <Label htmlFor="camp-discount">Camp discount (%)</Label>
            <Input
              id="camp-discount"
              type="number"
              min="0"
              max="100"
              step="1"
              value={campDiscountPct}
              onChange={(e) => setCampDiscountPct(e.target.value)}
              placeholder="e.g. 10"
            />
          </div>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={unlimitedPickup}
              onChange={(e) => setUnlimitedPickup(e.target.checked)}
            />
            Unlimited pick-up access
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={membersOnlyPickup}
              onChange={(e) => setMembersOnlyPickup(e.target.checked)}
            />
            Members-only pick-up sessions
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={unlimitedClasses}
              onChange={(e) => setUnlimitedClasses(e.target.checked)}
            />
            Unlimited classes
          </label>
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : isEdit ? "Save changes" : "Create tier"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <a href="/admin/memberships">Back</a>
        </Button>
      </div>
    </form>
  );
}
