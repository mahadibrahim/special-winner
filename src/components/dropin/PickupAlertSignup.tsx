"use client";

import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { toast } from "sonner";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";

/**
 * "Text me when games need players" — subscribe card for the pickup finder
 * pages (/adult/pickup, /soccerone/pickup, /dropin) and the manage-list
 * variant for /dashboard/play. Both live in this file per the Task 12 brief.
 *
 * Subscriptions are gated on a verified + opted-in phone (see
 * POST /api/dropin/alerts/subscriptions, which 409s with
 * `{ code: "phone_required" }` otherwise) — the fill-alert dispatcher only
 * knows how to send SMS.
 */

interface DropInSessionLite {
  venueId: string | null;
  venueName: string | null;
  sportOrClassLabel: string;
}

interface SessionsResponse {
  sessions: DropInSessionLite[];
}

interface Subscription {
  id: string;
  venueId: string | null;
  venueName: string | null;
  sport: string | null;
  active: boolean;
}

interface SubscriptionsResponse {
  subscriptions: Subscription[];
  phoneReady: boolean;
}

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

function redirectHref(): string {
  if (typeof window === "undefined") return "/signin";
  return `/signin?redirect=${encodeURIComponent(
    window.location.pathname + window.location.search,
  )}`;
}

/** Resolves signed-in state from a prop (SSR pages already know via
 * Astro.locals.user) or, if omitted, probes /api/auth/me the way
 * Navigation does for prerendered pages. */
function useSignedIn(initial: boolean | undefined): boolean | null {
  const [signedIn, setSignedIn] = useState<boolean | null>(
    initial === undefined ? null : initial,
  );

  useEffect(() => {
    if (initial !== undefined) return;
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((data) => {
        if (!cancelled) setSignedIn(Boolean(data.user));
      })
      .catch(() => {
        if (!cancelled) setSignedIn(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return signedIn;
}

export interface PickupAlertSignupProps {
  /** Auth state resolved server-side. Omit to probe /api/auth/me instead. */
  signedIn?: boolean;
}

export function PickupAlertSignup({ signedIn: signedInProp }: PickupAlertSignupProps) {
  useHydrationBeacon();
  const signedIn = useSignedIn(signedInProp);

  const [venues, setVenues] = useState<Array<{ id: string; name: string }>>([]);
  const [sports, setSports] = useState<string[]>([]);
  const [venueId, setVenueId] = useState("all");
  const [sport, setSport] = useState("all");
  const [submitting, setSubmitting] = useState(false);
  const [phoneRequired, setPhoneRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    if (signedIn !== true) return;
    let cancelled = false;
    // Same source PickupPageFinder uses — there's no standalone venues
    // endpoint, so derive the distinct venues/sports from the live schedule.
    fetch("/api/dropin/sessions")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((body: SessionsResponse) => {
        if (cancelled) return;
        const venueMap = new Map<string, string>();
        const sportSet = new Set<string>();
        for (const s of body.sessions ?? []) {
          if (s.venueId && s.venueName) venueMap.set(s.venueId, s.venueName);
          if (s.sportOrClassLabel) sportSet.add(s.sportOrClassLabel.toLowerCase());
        }
        setVenues(Array.from(venueMap, ([id, name]) => ({ id, name })));
        setSports(Array.from(sportSet));
      })
      .catch(() => {
        // Silent — the form still works with "All locations" / "All sports".
      });
    return () => {
      cancelled = true;
    };
  }, [signedIn]);

  async function subscribe() {
    setSubmitting(true);
    setError(null);
    setPhoneRequired(false);
    try {
      const res = await fetch("/api/dropin/alerts/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId: venueId === "all" ? null : venueId,
          sport: sport === "all" ? null : sport,
        }),
      });
      const data = await res.json();
      if (res.status === 409 && data.code === "phone_required") {
        setPhoneRequired(true);
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Couldn't subscribe — try again.");
        return;
      }
      setSubscribed(true);
      toast.success("You're set — we'll text you when a game needs players.");
    } catch {
      setError("Couldn't subscribe — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (signedIn === null) {
    return <LoadingSkeleton rows={2} />;
  }

  if (signedIn === false) {
    return (
      <div className="rounded-2xl border border-border bg-paper p-6 text-center space-y-3">
        <h3 className="text-lg font-semibold text-ink">
          Get a text when a game needs players
        </h3>
        <p className="text-sm text-ink-muted">Sign in to turn on pickup alerts.</p>
        <Button asChild>
          <a href={redirectHref()}>Sign in</a>
        </Button>
      </div>
    );
  }

  if (subscribed) {
    return (
      <div className="rounded-2xl border border-border bg-paper p-6 text-center space-y-2">
        <h3 className="text-lg font-semibold text-ink">You're on the list</h3>
        <p className="text-sm text-ink-muted">
          We'll text you when a pickup game needs players. Manage this anytime from{" "}
          <a href="/dashboard/play" className="underline">
            My Play
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-paper p-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-ink">
          Get a text when a game needs players
        </h3>
        <p className="text-sm text-ink-muted mt-1">
          We'll only text when a session is short on players — never spam.
        </p>
      </div>

      {phoneRequired && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <AlertCircle className="size-4 mt-0.5 shrink-0" aria-hidden="true" />
          <p className="flex-1">
            Verify your number first — takes 30 seconds.{" "}
            <a href="/dashboard/settings" className="underline font-medium">
              Go to settings
            </a>
          </p>
        </div>
      )}

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      {/*
        Native <select> rather than the shadcn/ui Select — Radix's
        SelectContent renders through a Portal appended near <body>, outside
        this card's DOM subtree. On the SoccerOne page this card sits inside
        a re-pinned light panel (SoccerOne remaps --ink/--paper to dark at
        the <html> level, see src/pages/soccerone/pickup.astro), and a
        portaled dropdown would inherit that page-wide dark remap instead of
        the local re-pin. application-form.tsx (the other cream-idiom
        component embedded in a SoccerOne page) uses native selects for the
        same reason.
      */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Location</label>
          <select
            value={venueId}
            onChange={(e) => setVenueId(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-paper border border-border text-sm text-ink"
          >
            <option value="all">All locations</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-ink-muted mb-1">Sport</label>
          <select
            value={sport}
            onChange={(e) => setSport(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-paper border border-border text-sm text-ink"
          >
            <option value="all">All sports</option>
            {sports.map((s) => (
              <option key={s} value={s}>
                {capitalize(s)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Button onClick={subscribe} disabled={submitting} className="w-full sm:w-auto">
        {submitting ? "Subscribing..." : "Text me when games need players"}
      </Button>
    </div>
  );
}

/**
 * Manage-list variant for /dashboard/play — shows active subscriptions with
 * a per-row "Stop texting me" (DELETE, sets active: false).
 */
export function MyPickupAlerts() {
  const [data, setData] = useState<SubscriptionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Set<string>>(new Set());

  const reload = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dropin/alerts/subscriptions");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as SubscriptionsResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  async function stop(id: string) {
    setRemoving((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/dropin/alerts/subscriptions/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error("Couldn't unsubscribe — try again.");
        return;
      }
      toast.success("You won't get texts for this one anymore.");
      await reload();
    } finally {
      setRemoving((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorBanner message={error} />;

  const subscriptions = data?.subscriptions ?? [];

  if (subscriptions.length === 0) {
    return (
      <EmptyState
        title="No pickup alerts yet"
        description="Turn on texts from a pickup page and we'll let you know when a game needs players."
      >
        <Button asChild variant="outline">
          <a href="/dropin">Browse drop-in sessions</a>
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-2">
      {subscriptions.map((s) => (
        <div
          key={s.id}
          className="flex items-center justify-between gap-3 rounded-xl border border-border bg-paper p-3"
        >
          <div className="text-sm text-ink">
            {s.venueName ?? "All locations"}
            {" · "}
            {s.sport ? capitalize(s.sport) : "All sports"}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={removing.has(s.id)}
            onClick={() => stop(s.id)}
          >
            {removing.has(s.id) ? "Stopping..." : "Stop texting me"}
          </Button>
        </div>
      ))}
    </div>
  );
}
