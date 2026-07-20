"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { toast } from "sonner";

/**
 * Manage-list variant for /dashboard/play — shows active subscriptions
 * created via the PickupNotifyBanner (src/components/dropin/PickupNotifyBanner.tsx)
 * on the pickup finder pages, with a per-row "Stop texting me" (DELETE, sets
 * active: false).
 */

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
