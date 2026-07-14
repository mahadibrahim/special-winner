"use client";

import { useEffect, useState } from "react";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";
import { PhoneKeypad } from "./PhoneKeypad";

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
  /** Hands the resolved self-serve token up to KioskRoot, which renders the
   *  finish flow inline. This component never navigates the tab. */
  onToken: (token: string) => void;
  onBack: () => void;
}

/** Minimum digits before we'll search. The API also enforces this — fewer
 *  than 4 digits would let anyone at the kiosk fish for other people's
 *  bookings. */
const MIN_DIGITS = 4;

/** "6145551234" -> "(614) 555-1234"; partial input formats as far as it goes. */
function formatPhone(digits: string): string {
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 10)}`;
}

export function FindBooking({ locationSlug, onToken, onBack }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  useEffect(() => {
    if (q.length < MIN_DIGITS) {
      setResults([]);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/kiosk/${locationSlug}/search?q=${encodeURIComponent(q)}`,
        );
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
    return () => {
      alive = false;
      clearTimeout(t);
    };
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
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((body as { error?: string }).error ?? `Couldn't open (${res.status})`);
        return;
      }
      // The kiosk tab never leaves /kiosk/<slug> — hand the token up and let
      // KioskRoot render the finish flow inline.
      onToken((body as { token: string }).token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setOpening(false);
    }
  };

  const idle = q.length < MIN_DIGITS && !loading;
  const noMatches = !loading && q.length >= MIN_DIGITS && results.length === 0;

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="min-h-[44px] text-base text-ink-muted hover:text-ink transition-colors"
      >
        ← Back
      </button>

      <header className="space-y-2">
        <h1 className="font-display text-4xl md:text-5xl font-medium italic leading-[0.95] text-ink">
          Find your booking
        </h1>
        <p className="text-base text-ink-2 leading-relaxed pt-1">
          Enter the phone number on your booking.
        </p>
      </header>

      <div className="space-y-4">
        <div
          aria-live="polite"
          className="min-h-[64px] flex items-center justify-center rounded-xl border border-border bg-paper px-5 py-3"
        >
          {q ? (
            <span className="font-display text-4xl font-medium tracking-wide text-ink">
              {formatPhone(q)}
            </span>
          ) : (
            <span className="font-display text-4xl italic text-ink-faint">
              Phone number
            </span>
          )}
        </div>
        <PhoneKeypad value={q} onChange={setQ} />
        <p className="text-xs text-ink-muted px-1 text-center">
          We only search by phone number, so other guests' names stay private.
        </p>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {loading && <LoadingSkeleton />}

      {idle && (
        <div className="rounded-xl border border-dashed border-border bg-cream-2 px-5 py-6 text-center">
          <p className="font-display text-lg italic text-ink-muted">
            Enter at least {MIN_DIGITS} digits to find your booking.
          </p>
        </div>
      )}

      {noMatches && (
        <div className="rounded-xl border border-border bg-paper p-5">
          <p className="text-base font-medium text-ink mb-1">
            No bookings match that number today.
          </p>
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
              className="w-full min-h-[60px] text-left p-4 rounded-xl border border-border bg-paper hover:bg-cream-2 hover:border-ink/40 transition-colors flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="flex-1 min-w-0">
                <div className="text-base font-medium text-ink truncate">{r.title}</div>
                <div className="text-sm text-ink-muted truncate mt-0.5">{r.subtitle}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {/* Accent tokens carry meaning as a tint + border only —
                      never as a text color (they don't invert across brands
                      and land near 2:1 on the light one). */}
                  {r.waiverSigned ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-sage/60 bg-sage/10 px-2 py-0.5 text-xs text-ink-2">
                      <span aria-hidden="true">✓</span> Waiver signed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-ochre/60 bg-ochre/10 px-2 py-0.5 text-xs text-ink-2">
                      <span aria-hidden="true">⚠</span> Waiver missing
                    </span>
                  )}
                  {r.checkedIn && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-sage/60 bg-sage/10 px-2 py-0.5 text-xs text-ink-2">
                      <span aria-hidden="true">✓</span> Checked in
                    </span>
                  )}
                </div>
              </div>
              <span aria-hidden="true" className="text-ink-faint text-2xl">
                ›
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
