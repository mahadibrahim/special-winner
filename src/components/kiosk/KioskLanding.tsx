"use client";

import { useState } from "react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { FindBooking } from "./FindBooking";
import { WalkInWizard } from "./WalkInWizard";

type Mode = "landing" | "find" | "walkin";

export default function KioskLanding({
  venueSlug,
  venueName,
  publishableKey,
}: {
  venueSlug: string;
  venueName: string;
  publishableKey: string;
}) {
  useHydrationBeacon();
  const [mode, setMode] = useState<Mode>("landing");

  if (mode === "find") {
    return <FindBooking venueSlug={venueSlug} venueName={venueName} onBack={() => setMode("landing")} />;
  }

  if (mode === "walkin") {
    return (
      <WalkInWizard
        venueSlug={venueSlug}
        venueName={venueName}
        publishableKey={publishableKey}
        onBack={() => setMode("landing")}
      />
    );
  }

  return (
    <div className="space-y-6 text-center pt-8">
      <header>
        <h1 className="text-3xl font-semibold">Welcome to {venueName}</h1>
        <p className="text-stone-600 mt-2">Find your booking, or register as a walk-in.</p>
      </header>
      <div className="grid gap-3">
        <button
          type="button"
          onClick={() => setMode("find")}
          className="w-full px-6 py-6 rounded-lg bg-stone-900 text-white text-lg font-medium"
        >
          Find my booking
        </button>
        <button
          type="button"
          onClick={() => setMode("walkin")}
          className="w-full px-6 py-6 rounded-lg border-2 border-stone-900 text-lg font-medium"
        >
          Walk-in registration
        </button>
      </div>
    </div>
  );
}
