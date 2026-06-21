import { useEffect, useRef, useState } from "react";
import type { VenueTodayPayload } from "@/lib/venue/today-types";

/**
 * Fetches Venue Today data for a (locationId, date) pair and polls every
 * POLL_INTERVAL_MS while the page is visible. Pauses on tab hide and
 * refetches immediately when focus returns.
 *
 * Polling is the right tool here: small payload, single-digit user count
 * per venue, no need for sub-second latency. Stateless polling avoids
 * websocket/SSE operational complexity.
 */

const POLL_INTERVAL_MS = 7_000;

type Args = { date: string; locationId: string | null };

export type UseVenueTodayResult = {
  data: VenueTodayPayload | null;
  isLoading: boolean;
  isStale: boolean;
  lastUpdatedAt: number | null;
  refetch: () => void;
  error: Error | null;
};

export function useVenueToday({ date, locationId }: Args): UseVenueTodayResult {
  const [data, setData] = useState<VenueTodayPayload | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlight = useRef(false);

  // useRef'd fetch so handlers don't capture a stale closure when (date,
  // locationId) change between renders.
  const fetchDataRef = useRef<() => Promise<void>>(async () => {});
  fetchDataRef.current = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const res = await fetch(
        `/api/admin/venue/today?date=${encodeURIComponent(date)}&locationId=${encodeURIComponent(locationId ?? "")}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as VenueTodayPayload;
      setData(json);
      setLastUpdatedAt(Date.now());
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      inFlight.current = false;
      setLoading(false);
    }
  };

  useEffect(() => {
    function startPolling() {
      if (intervalRef.current) return;
      intervalRef.current = setInterval(() => {
        void fetchDataRef.current();
      }, POLL_INTERVAL_MS);
    }
    function stopPolling() {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    void fetchDataRef.current();
    if (typeof document !== "undefined" && document.visibilityState === "visible") {
      startPolling();
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") {
        void fetchDataRef.current();
        startPolling();
      } else {
        stopPolling();
      }
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibilityChange);
    }
    return () => {
      stopPolling();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibilityChange);
      }
    };
  }, [date, locationId]);

  const isStale =
    lastUpdatedAt !== null && Date.now() - lastUpdatedAt > POLL_INTERVAL_MS * 2;

  return {
    data,
    isLoading,
    isStale,
    lastUpdatedAt,
    refetch: () => void fetchDataRef.current(),
    error,
  };
}
