"use client";

import { useEffect, useState } from "react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { KIOSK_RETURN_SLUG_KEY } from "@/lib/kiosk/return-slug";
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

/** Seconds the "checked in" screen waits before returning a kiosk to its
 *  landing page for the next person. */
const KIOSK_REDIRECT_SECONDS = 12;
const SLUG_RX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/i;

export default function SelfServe({
  token,
  context,
  kioskSlug,
}: {
  token: string;
  context: Context;
  /** Kiosk slug from the ?kiosk= query param, when present. */
  kioskSlug?: string | null;
}) {
  useHydrationBeacon();

  const [waiverDone, setWaiverDone] = useState(!context.outstanding.waiver);
  const [photoDone, setPhotoDone] = useState(!context.outstanding.photo);
  const [allDone, setAllDone] = useState(false);

  // The kiosk this tab belongs to, if any. Prefer the ?kiosk= query param;
  // fall back to the slug the kiosk stashed in sessionStorage before
  // navigating here — that survives the multi-step self-serve flow reliably.
  const [returnSlug, setReturnSlug] = useState<string | null>(
    kioskSlug && SLUG_RX.test(kioskSlug) ? kioskSlug : null,
  );
  useEffect(() => {
    if (returnSlug) return;
    try {
      const stored = sessionStorage.getItem(KIOSK_RETURN_SLUG_KEY);
      if (stored && SLUG_RX.test(stored)) setReturnSlug(stored);
    } catch {
      /* sessionStorage unavailable — this isn't a kiosk session */
    }
  }, [returnSlug]);

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
      <CheckedInScreen
        spaceName={context.spaceName ?? null}
        summary={context.summary}
        returnSlug={returnSlug}
      />
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

/**
 * Final "you're checked in" screen. On a kiosk (a return slug is known) it
 * counts down and redirects back to the kiosk landing so the device is ready
 * for the next person; a "Back to start" button skips the wait. Opened from a
 * personal SMS/email link (no kiosk), it just shows the confirmation.
 */
function CheckedInScreen({
  spaceName,
  summary,
  returnSlug,
}: {
  spaceName: string | null;
  summary: string;
  returnSlug: string | null;
}) {
  const [secondsLeft, setSecondsLeft] = useState(KIOSK_REDIRECT_SECONDS);

  useEffect(() => {
    if (!returnSlug) return;
    if (secondsLeft <= 0) {
      window.location.href = `/kiosk/${returnSlug}`;
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, returnSlug]);

  return (
    <div className="space-y-4">
      <div className="p-6 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900">
        <h1 className="text-lg font-semibold mb-2">You're checked in</h1>
        <p className="text-sm leading-relaxed">
          {spaceName
            ? `Head over to ${spaceName} — your game is on. Enjoy!`
            : "You're all set — enjoy your game!"}
        </p>
        {summary && (
          <p className="mt-2 text-xs text-emerald-800/70">{summary}</p>
        )}
      </div>
      {returnSlug && (
        <div className="space-y-2">
          <a
            href={`/kiosk/${returnSlug}`}
            className="block w-full rounded-lg bg-primary px-6 py-3 text-center text-sm font-medium text-cream transition-colors hover:bg-primary/90"
          >
            Back to start
          </a>
          <p className="text-center text-xs text-ink-muted">
            Returning to the start screen in {Math.max(secondsLeft, 0)}s…
          </p>
        </div>
      )}
    </div>
  );
}
