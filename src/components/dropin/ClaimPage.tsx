"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { toast } from "sonner";

interface ClaimInfo {
  bookingId: string;
  sessionId: string;
  promotionExpiresAt: string;
  paymentMethod: string;
  amountPaidCents: number;
}

interface ClaimPageProps {
  token: string;
  isAuthenticated: boolean;
}

export default function ClaimPage({ token, isAuthenticated }: ClaimPageProps) {
  useHydrationBeacon();

  const [info, setInfo] = useState<ClaimInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const fetchClaim = async () => {
      try {
        const res = await fetch(`/api/dropin/claim/${token}`);
        const json = await res.json();
        if (!res.ok) {
          setError(
            res.status === 410
              ? "This claim window has expired."
              : (json.error ?? "Invalid claim"),
          );
          return;
        }
        setInfo(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    };
    void fetchClaim();
  }, [token]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorBanner message={error} />;
  if (!info) return null;

  const expiresAt = new Date(info.promotionExpiresAt).getTime();
  const remainingMs = Math.max(0, expiresAt - now);
  const remainingMin = Math.floor(remainingMs / 60000);
  const remainingSec = Math.floor((remainingMs % 60000) / 1000);
  const expired = remainingMs <= 0;

  const claim = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/dropin/claim/${token}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Claim failed");
        return;
      }
      toast.success("Spot confirmed");
      window.location.href = `/dropin/${info.sessionId}?booking=success`;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-stone-900">Claim your spot</h1>
        <p className="mt-1 text-sm text-stone-600">
          A waitlist spot opened up for you.
        </p>
      </header>

      <div className="rounded-xl border border-stone-200 bg-white p-5 space-y-3">
        <div className="text-sm text-stone-700">
          {expired ? (
            <span className="text-amber-700 font-medium">Window expired</span>
          ) : (
            <>
              <span className="font-medium">{remainingMin}:{String(remainingSec).padStart(2, "0")}</span>{" "}
              left to claim
            </>
          )}
        </div>

        {info.paymentMethod === "card_online" && info.amountPaidCents > 0 && (
          <p className="text-sm text-stone-600">
            Already paid — claim confirms your spot.
          </p>
        )}

        {!isAuthenticated && (
          <Button asChild className="w-full">
            <a href={`/signin?redirect=/dropin/claim/${token}`}>Sign in to claim</a>
          </Button>
        )}

        {isAuthenticated && (
          <Button onClick={claim} disabled={busy || expired} className="w-full">
            {busy ? "Working…" : expired ? "Expired" : "Confirm my spot"}
          </Button>
        )}

        <a
          href={`/dropin/${info.sessionId}`}
          className="block text-center text-xs text-stone-500 hover:text-stone-900"
        >
          See session details
        </a>
      </div>
    </div>
  );
}
