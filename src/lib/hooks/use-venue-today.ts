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
const FETCH_TIMEOUT_MS = 10_000;

type Args = { date: string; locationId: string | null };

export type UseVenueTodayResult = {
  data: VenueTodayPayload | null;
  isLoading: boolean;
  isStale: boolean;
  lastUpdatedAt: number | null;
  nowTick: number;
  refetch: () => void;
  error: Error | null;
};

export function useVenueToday({ date, locationId }: Args): UseVenueTodayResult {
  const [data, setData] = useState<VenueTodayPayload | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const inFlight = useRef(false);

  // useRef'd fetch so handlers don't capture a stale closure when (date,
  // locationId) change between renders.
  const fetchDataRef = useRef<() => Promise<void>>(async () => {});
  fetchDataRef.current = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(
        `/api/admin/venue/today?date=${encodeURIComponent(date)}&locationId=${encodeURIComponent(locationId ?? "")}`,
        { signal: controller.signal },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as VenueTodayPayload;
      setData(json);
      setLastUpdatedAt(Date.now());
      setError(null);
    } catch (e) {
      setError(e as Error);
    } finally {
      clearTimeout(timeout);
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

  // 1-second ticker so staleness (and any "Ns ago" stamp derived from it)
  // updates live in the UI rather than only on the next poll/render.
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1_000);
    return () => clearInterval(t);
  }, []);

  const isStale =
    lastUpdatedAt !== null && nowTick - lastUpdatedAt > POLL_INTERVAL_MS * 2;

  return {
    data,
    isLoading,
    isStale,
    lastUpdatedAt,
    nowTick,
    refetch: () => void fetchDataRef.current(),
    error,
  };
}
