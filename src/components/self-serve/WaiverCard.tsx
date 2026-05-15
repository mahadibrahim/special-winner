"use client";

import { useState } from "react";

const WAIVER_TEXT = `I acknowledge the inherent risks of recreational sports activity. By accepting below, I waive Aspire Sports from liability for injuries that may occur during my booked session or rental, and confirm I am physically fit to participate.`;

interface Props {
  token: string;
  signerName: string;
  done: boolean;
  onDone: () => void;
}

export function WaiverCard({ token, signerName, done, onDone }: Props) {
  const [accepted, setAccepted] = useState(false);
  const [typed, setTyped] = useState(signerName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <div className="p-4 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900 text-sm flex items-center gap-2">
        <span aria-hidden="true">&#10003;</span>
        <span>Waiver signed</span>
      </div>
    );
  }

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
    <form onSubmit={onSubmit} className="p-4 rounded-lg border space-y-3 bg-white">
      <h2 className="font-semibold">Sign the liability waiver</h2>
      <p className="text-sm text-stone-700 bg-stone-50 border rounded p-3 whitespace-pre-wrap">
        {WAIVER_TEXT}
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-1"
        />
        <span>I accept the waiver above</span>
      </label>
      <div>
        <label htmlFor="typed-name" className="block text-xs text-stone-600 mb-1">
          Type your full legal name to sign
        </label>
        <input
          id="typed-name"
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="w-full border rounded px-3 py-2"
          autoComplete="name"
        />
      </div>
      {error && <div className="text-sm text-rose-700">{error}</div>}
      <button
        type="submit"
        disabled={busy || !accepted || typed.trim().length === 0}
        className="w-full px-4 py-2 rounded bg-stone-900 text-white disabled:opacity-50"
      >
        {busy ? "Saving..." : "Save signature"}
      </button>
    </form>
  );
}
