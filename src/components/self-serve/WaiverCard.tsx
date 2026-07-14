"use client";

import { useState } from "react";
import { ErrorBanner } from "@/components/ui/error-banner";
import { CARD_CLASS, DONE_CARD_CLASS, INPUT_CLASS, PRIMARY_BTN } from "./card-styles";

const WAIVER_TEXT = `I acknowledge the inherent risks of recreational sports activity, including contact, falls, and weather-related conditions. I waive SoccerOne, operated by Aspire Sports, and its partner venues from liability for injuries that occur during this session, and I confirm that the player named above is physically able to participate.`;

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
  done: boolean;
  onDone: () => void;
}

export function WaiverCard({ token, signerName, playerName, isMinor, done, onDone }: Props) {
  const [accepted, setAccepted] = useState(false);
  const [typed, setTyped] = useState(signerName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <div className={DONE_CARD_CLASS}>
        <span aria-hidden="true" className="text-sage">&#10003;</span>
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
        {WAIVER_TEXT}
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
