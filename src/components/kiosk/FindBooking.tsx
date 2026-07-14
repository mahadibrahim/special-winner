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
  locationSlug: string;
  locationName: string;
  onBack: () => void;
}

export function FindBooking({ locationSlug, locationName, onBack }: Props) {
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
        const res = await fetch(`/api/kiosk/${locationSlug}/search?q=${encodeURIComponent(q.trim())}`);
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
  }, [q, locationSlug]);

  const openResult = async (r: Result) => {
    setOpening(true);
    setError(null);
    try {
      const res = await fetch(`/api/kiosk/${locationSlug}/token-for-target`, {
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
      // Carry the kiosk slug so the self-serve completion screen can show a
      // "Done" link back to this kiosk for the next person.
      window.location.href = `${body.url}?kiosk=${encodeURIComponent(locationSlug)}`;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setOpening(false);
    }
  };

  const idle = q.trim().length < 2 && !loading;
  const noMatches = !loading && q.trim().length >= 2 && results.length === 0;

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="text-sm text-ink-muted hover:text-ink transition-colors"
      >
        ← Back
      </button>

      <header className="space-y-2">
        <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-primary">
          Find your booking
        </p>
        <h1 className="font-display text-4xl md:text-5xl font-medium italic leading-[0.95] text-ink">
          {locationName}
        </h1>
        <p className="text-sm text-ink-muted leading-relaxed pt-1">
          We'll look up today's reservations so you can finish anything left.
        </p>
      </header>

      <div className="space-y-2">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Last 4 digits of your phone number"
          className="w-full px-5 py-4 bg-paper border border-border focus:border-ink focus:outline-none rounded-xl text-lg placeholder:text-ink-faint transition-colors"
          autoFocus
        />
        <p className="text-xs text-ink-muted px-1">
          Tip: we only search by phone number, so other guests' names stay private.
        </p>
      </div>

      {loading && <LoadingSkeleton />}

      {idle && (
        <div className="rounded-xl border border-dashed border-border bg-cream-2 px-5 py-8 text-center">
          <p className="font-display text-lg italic text-ink-muted">
            Start typing to find your booking.
          </p>
        </div>
      )}

      {noMatches && (
        <div className="rounded-xl border border-border bg-paper p-5">
          <p className="text-sm font-medium text-ink mb-1">No bookings match "{q}" today.</p>
          <p className="text-sm text-ink-muted">
            Ask the front desk and we'll text or email a link to your phone.
          </p>
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted px-1">
            Today's matches
          </p>
          {results.map((r) => (
            <button
              type="button"
              key={`${r.kind}-${r.targetId}`}
              onClick={() => openResult(r)}
              disabled={opening}
              className="w-full text-left p-4 rounded-xl border border-border bg-paper hover:bg-cream-2 hover:border-ink/40 transition-colors flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-ink truncate">{r.title}</div>
                <div className="text-xs text-ink-muted truncate mt-0.5">{r.subtitle}</div>
                <div className="text-xs mt-2 flex gap-3">
                  {r.waiverSigned ? (
                    <span className="text-sage">✓ waiver signed</span>
                  ) : (
                    <span className="text-ochre">⚠ waiver missing</span>
                  )}
                  {r.checkedIn && <span className="text-sage">✓ checked in</span>}
                </div>
              </div>
              <span aria-hidden="true" className="text-ink-faint text-2xl">›</span>
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-200/70 bg-rose-50/40 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}
    </div>
  );
}
