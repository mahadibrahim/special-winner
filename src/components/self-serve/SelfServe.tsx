"use client";

import { useState } from "react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { WaiverCard } from "./WaiverCard";
import { PhotoCard } from "./PhotoCard";

interface Context {
  tokenKind: string;
  displayName: string;
  signerName: string | null;
  summary: string;
  outstanding: { waiver: boolean; photo: boolean; payment: boolean };
  expiresAt: string;
}

export default function SelfServe({
  token,
  context,
}: {
  token: string;
  context: Context;
}) {
  useHydrationBeacon();

  const [waiverDone, setWaiverDone] = useState(!context.outstanding.waiver);
  const [photoDone, setPhotoDone] = useState(!context.outstanding.photo);
  const [allDone, setAllDone] = useState(false);

  const maybeConsume = async (overrideWaiver?: boolean, overridePhoto?: boolean) => {
    const effectiveWaiver = overrideWaiver ?? waiverDone;
    const effectivePhoto = overridePhoto ?? photoDone;
    if (effectiveWaiver && effectivePhoto && !allDone) {
      try {
        await fetch(`/api/self-serve/${token}/consume`, { method: "POST" });
      } catch {
        // consume failure is non-blocking — the writes already landed
      }
      setAllDone(true);
    }
  };

  const onWaiverDone = () => {
    setWaiverDone(true);
    setTimeout(() => maybeConsume(true, photoDone), 0);
  };

  const onPhotoDone = () => {
    setPhotoDone(true);
    setTimeout(() => maybeConsume(waiverDone, true), 0);
  };

  if (allDone) {
    return (
      <div className="p-6 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900">
        <h1 className="text-lg font-semibold mb-2">You're all set</h1>
        <p className="text-sm">See you at {context.summary}.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Hi {context.displayName}</h1>
        <p className="text-sm text-stone-600">{context.summary}</p>
      </header>

      {context.outstanding.waiver && (
        <WaiverCard
          token={token}
          signerName={context.signerName ?? context.displayName}
          done={waiverDone}
          onDone={onWaiverDone}
        />
      )}
      {context.outstanding.photo && (
        <PhotoCard token={token} done={photoDone} onDone={onPhotoDone} />
      )}
    </div>
  );
}
