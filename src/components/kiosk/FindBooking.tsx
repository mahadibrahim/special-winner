"use client";

import { useEffect, useState } from "react";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

interface Result {
  kind: "drop_in_booking" | "field_rental";
  targetId: string;
  title: string;
  subtitle: string;
  waiverSigned: boolean;
  checkedIn: boolean;
}

interface Props {
  venueSlug: string;
  venueName: string;
  onBack: () => void;
}

export function FindBooking({ venueSlug, venueName, onBack }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    let alive = true;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/kiosk/${venueSlug}/search?q=${encodeURIComponent(q.trim())}`);
        if (!res.ok) {
          if (alive) setError(`Search failed (${res.status})`);
          return;
        }
        const body = await res.json();
        if (alive) setResults(body.results ?? []);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Network error");
      } finally {
        if (alive) setLoading(false);
      }
    }, 250);
    return () => { alive = false; clearTimeout(t); };
  }, [q, venueSlug]);

  const openResult = async (r: Result) => {
    setOpening(true);
    setError(null);
    try {
      const res = await fetch(`/api/kiosk/${venueSlug}/token-for-target`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: r.kind, targetId: r.targetId }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error ?? `Couldn't open (${res.status})`);
        return;
      }
      const body = await res.json();
      window.location.href = body.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setOpening(false);
    }
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onBack}
        className="text-sm text-stone-600"
      >
        ← Back
      </button>
      <header>
        <h1 className="text-2xl font-semibold">{venueName}</h1>
        <p className="text-stone-600 text-sm">Find your booking to finish anything left.</p>
      </header>
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search by name or last 4 of your phone…"
        className="w-full px-4 py-3 border rounded-lg text-base"
        autoFocus
      />
      {loading && <LoadingSkeleton />}
      {!loading && q.trim().length >= 2 && results.length === 0 && (
        <div className="p-4 text-center text-sm text-stone-500">
          No bookings match "{q}" today. Ask the front desk to text or email a link.
        </div>
      )}
      <div className="space-y-2">
        {results.map((r) => (
          <button
            type="button"
            key={`${r.kind}-${r.targetId}`}
            onClick={() => openResult(r)}
            disabled={opening}
            className="w-full text-left p-3 border rounded-lg bg-white flex items-center gap-3 disabled:opacity-50"
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{r.title}</div>
              <div className="text-xs text-stone-500 truncate">{r.subtitle}</div>
              <div className="text-xs mt-1 flex gap-2">
                {r.waiverSigned ? (
                  <span className="text-emerald-700">✓ waiver</span>
                ) : (
                  <span className="text-amber-700">⚠ waiver missing</span>
                )}
                {r.checkedIn && <span className="text-emerald-700">✓ checked in</span>}
              </div>
            </div>
            <span className="text-stone-400 text-2xl">›</span>
          </button>
        ))}
      </div>
      {error && <div className="text-sm text-rose-700">{error}</div>}
    </div>
  );
}
