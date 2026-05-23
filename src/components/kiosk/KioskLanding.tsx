"use client";

import { useEffect, useState } from "react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { KIOSK_RETURN_SLUG_KEY } from "@/lib/kiosk/return-slug";
import { FindBooking } from "./FindBooking";
import { WalkInWizard } from "./WalkInWizard";

type Mode = "landing" | "find" | "walkin";

export default function KioskLanding({
  locationSlug,
  locationName,
  publishableKey,
}: {
  locationSlug: string;
  locationName: string;
  publishableKey: string;
}) {
  useHydrationBeacon();
  const [mode, setMode] = useState<Mode>("landing");

  // Remember which kiosk this browser tab belongs to. The "Find my booking"
  // flow navigates the tab to a separate /self-serve route; stashing the slug
  // here lets that page's completion screen return to this kiosk reliably
  // (a query param can be lost across the multi-step flow; sessionStorage
  // survives same-tab navigation).
  useEffect(() => {
    try {
      sessionStorage.setItem(KIOSK_RETURN_SLUG_KEY, locationSlug);
    } catch {
      /* sessionStorage unavailable — non-fatal, the ?kiosk= param still tries */
    }
  }, [locationSlug]);

  if (mode === "find") {
    return <FindBooking locationSlug={locationSlug} locationName={locationName} onBack={() => setMode("landing")} />;
  }

  if (mode === "walkin") {
    return (
      <WalkInWizard
        locationSlug={locationSlug}
        locationName={locationName}
        publishableKey={publishableKey}
        onBack={() => setMode("landing")}
      />
    );
  }

  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-primary">
          Welcome
        </p>
        <h1 className="font-display text-5xl md:text-6xl font-medium italic leading-[0.95] text-ink">
          {locationName}
        </h1>
        <div className="h-px bg-border w-16" />
        <p className="text-base text-ink-2 leading-relaxed max-w-md">
          Tap below to find your booking and finish anything you started — or register on the spot as a walk-in.
        </p>
      </header>

      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setMode("find")}
          className="group w-full px-6 py-7 rounded-xl bg-primary text-cream text-left transition-all hover:bg-primary/90 active:scale-[0.99] shadow-sm"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold tracking-[0.15em] uppercase text-cream/70 mb-1">
                Already booked
              </div>
              <div className="text-2xl font-medium">Find my booking</div>
            </div>
            <span aria-hidden="true" className="text-3xl text-cream/80 transition-transform group-hover:translate-x-1">
              ›
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setMode("walkin")}
          className="group w-full px-6 py-7 rounded-xl bg-paper border border-ink/80 text-ink text-left transition-all hover:bg-cream-2 active:scale-[0.99]"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold tracking-[0.15em] uppercase text-ink-muted mb-1">
                Just dropping in
              </div>
              <div className="text-2xl font-medium">Walk-in registration</div>
            </div>
            <span aria-hidden="true" className="text-3xl text-ink-faint transition-transform group-hover:translate-x-1">
              ›
            </span>
          </div>
        </button>
      </div>

      <div className="pt-6 border-t border-border">
        <p className="text-xs text-ink-muted leading-relaxed">
          Need help? Ask the front desk — we can text or email a link to your phone instead.
        </p>
      </div>
    </div>
  );
}
