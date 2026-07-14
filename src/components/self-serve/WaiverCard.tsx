"use client";

import { useEffect, useRef, useState } from "react";
import { ErrorBanner } from "@/components/ui/error-banner";
import { CARD_CLASS, DONE_CARD_CLASS, INPUT_CLASS, PRIMARY_BTN } from "./card-styles";
import { getBrandTheme, type BrandId } from "@/lib/branding/themes";

/**
 * The waiver names a legal entity, and this card is SHARED — the standalone
 * /self-serve/[token] page renders it for every tenant on both brands. It
 * used to hardcode "SoccerOne", so an Aspire customer signed a liability
 * waiver naming a brand they had never heard of. The entity phrase now comes
 * from the brand theme (themes.ts → waiverEntity), which is the ONLY mapping:
 * a new brand is a new entry there, never an edit here.
 */
function waiverText(brandId: BrandId | undefined): string {
  const entity = getBrandTheme(brandId).waiverEntity;
  return `I acknowledge the inherent risks of recreational sports activity, including contact, falls, and weather-related conditions. I waive ${entity} from liability for injuries that occur during this session, and I confirm that the player named above is physically able to participate.`;
}

interface Props {
  token: string;
  signerName: string;
  /** The player — rendered into the guardian consent sentence when
   *  isMinor is true. */
  playerName: string;
  /** Authoritative guardian-vs-adult signal, threaded from
   *  resolveSigner() via build-context.ts. THE source of truth — never
   *  re-derive this from comparing signerName/playerName strings (a
   *  guardian who shares the minor's exact name, e.g. Jr./Sr., breaks
   *  that comparison silently). */
  isMinor: boolean;
  /** Host-derived brand. Decides which legal entity the waiver names — see
   *  waiverText() above. Optional: omitted → the Aspire default, so no
   *  caller breaks and the fallback is never a brand the customer hasn't
   *  heard of. */
  brandId?: BrandId;
  done: boolean;
  onDone: () => void;
  /** Reports "a request of mine is in flight" to the embedder (the kiosk),
   *  so its idle timer can't hard-reset the screen mid-submit and strand a
   *  signature that already landed server-side. Optional — the standalone
   *  /self-serve/[token] page has no idle timer and passes nothing. */
  onBusy?: (busy: boolean) => void;
}

export function WaiverCard({
  token,
  signerName,
  playerName,
  isMinor,
  brandId,
  done,
  onDone,
  onBusy,
}: Props) {
  const [accepted, setAccepted] = useState(false);
  const [typed, setTyped] = useState(signerName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mirror `busy` upward, and ALWAYS release it on unmount. A busy signal
  // stuck true would suppress the kiosk's idle reset forever — leaving the
  // last customer's details on a public screen, the exact failure the idle
  // timer exists to prevent. Deriving the signal from state (rather than
  // calling onBusy imperatively at each exit) makes every true-path
  // structurally paired with a false-path: `finally { setBusy(false) }`.
  const onBusyRef = useRef(onBusy);
  onBusyRef.current = onBusy;
  useEffect(() => {
    onBusyRef.current?.(busy);
    return () => {
      if (busy) onBusyRef.current?.(false);
    };
  }, [busy]);

  if (done) {
    return (
      <div className={DONE_CARD_CLASS}>
        <span aria-hidden="true">&#10003;</span>
        <span>Waiver signed</span>
      </div>
    );
  }

  const acceptLabel = isMinor
    ? `I am the parent or legal guardian of ${playerName} and accept these terms on their behalf.`
    : "I have read and accept these terms.";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accepted || typed.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/self-serve/${token}/waiver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acceptedName: typed.trim() }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError((b as any).error ?? `Save failed (${res.status})`);
        return;
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={onSubmit} className={CARD_CLASS}>
      <h2 className="font-semibold text-ink">Sign the liability waiver</h2>
      <p className="text-sm text-ink-muted bg-cream-2 border border-border rounded p-3 whitespace-pre-wrap">
        {waiverText(brandId)}
      </p>
      <label className="flex items-start gap-2 text-sm text-ink">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-1"
        />
        <span>{acceptLabel}</span>
      </label>
      <div>
        <label htmlFor="typed-name" className="block text-xs text-ink-muted mb-1">
          {isMinor ? "Parent/guardian signature" : "Signature"}
        </label>
        <input
          id="typed-name"
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className={INPUT_CLASS}
          autoComplete="name"
        />
      </div>
      <ErrorBanner message={error} />
      <button
        type="submit"
        disabled={busy || !accepted || typed.trim().length === 0}
        className={PRIMARY_BTN}
      >
        {busy ? "Saving..." : "Save signature"}
      </button>
    </form>
  );
}
