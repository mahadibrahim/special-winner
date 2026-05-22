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
  spaceName?: string | null;
  outstanding: { waiver: boolean; photo: boolean; payment: boolean };
  expiresAt: string;
}

export default function SelfServe({
  token,
  context,
  kioskSlug,
}: {
  token: string;
  context: Context;
  /** Set when this page was opened from a kiosk — enables a "Done" link
   *  back to that kiosk's landing screen. */
  kioskSlug?: string | null;
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

  // Nothing left to do — either the customer just finished every card, or
  // they opened the link with the waiver/photo already on file. Both cases
  // show the confirmation rather than a bare, actionless header.
  const nothingOutstanding =
    !context.outstanding.waiver && !context.outstanding.photo;

  if (allDone || nothingOutstanding) {
    return (
      <div className="space-y-4">
        <div className="p-6 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900">
          <h1 className="text-lg font-semibold mb-2">You're checked in</h1>
          <p className="text-sm leading-relaxed">
            {context.spaceName
              ? `Head over to ${context.spaceName} — your game is on. Enjoy!`
              : "You're all set — enjoy your game!"}
          </p>
          {context.summary && (
            <p className="mt-2 text-xs text-emerald-800/70">
              {context.summary}
            </p>
          )}
        </div>
        {kioskSlug && (
          <a
            href={`/kiosk/${kioskSlug}`}
            className="block w-full rounded-lg bg-primary px-6 py-3 text-center text-sm font-medium text-cream transition-colors hover:bg-primary/90"
          >
            Done
          </a>
        )}
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
