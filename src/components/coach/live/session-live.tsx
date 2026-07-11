"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import type { LivePayload, AttendanceStatus, CaptureInput } from "@/lib/sessions/types";
import {
  emptyQueue, enqueueCapture, enqueueAttendance, enqueueConsume,
  buildEnvelope, markFlushed, serializeQueue, restoreQueue,
  type QueueState,
} from "@/lib/sessions/capture-queue";
import SetupView from "./setup-view";
import FieldMode from "./field-mode";
import WrapUp from "./wrap-up";

type Stage = "setup" | "field" | "wrapup" | "done" | "cancelled";

function stageFor(status: LivePayload["session"]["status"]): Stage {
  if (status === "cancelled") return "cancelled";
  if (status === "completed") return "done";
  if (status === "in_progress") return "field";
  return "setup";
}

const storageKey = (sessionId: string) => `session-live-queue:${sessionId}`;

export default function SessionLive({ sessionId }: { sessionId: string }) {
  useHydrationBeacon();

  const [payload, setPayload] = useState<LivePayload | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [stage, setStage] = useState<Stage>("setup");
  const [offline, setOffline] = useState(false);
  const queueRef = useRef<QueueState>(emptyQueue);
  const [, forceRender] = useState(0);
  const flushing = useRef(false);
  // A failed "in_progress" PUT is queued here and retried by the reconnect
  // loop — the coach has already moved to field mode optimistically.
  // "completed" is deliberately excluded: wrap-up's Finish requires
  // connectivity and reports failure to the coach instead.
  const pendingTransitionRef = useRef<"in_progress" | null>(null);
  const retryingTransition = useRef(false);

  const persistQueue = useCallback(() => {
    try {
      sessionStorage.setItem(storageKey(sessionId), serializeQueue(queueRef.current));
    } catch {
      /* storage full/unavailable — in-memory queue still works */
    }
    forceRender((n) => n + 1);
  }, [sessionId]);

  const flushNow = useCallback(async () => {
    if (flushing.current) return;
    const envelope = buildEnvelope(queueRef.current);
    if (!envelope) return;
    flushing.current = true;
    try {
      const res = await fetch(`/api/coach/sessions/${sessionId}/captures`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(envelope),
      });
      if (!res.ok) throw new Error(String(res.status));
      queueRef.current = markFlushed(queueRef.current, envelope);
      setOffline(false);
      persistQueue();
    } catch {
      setOffline(true);
    } finally {
      flushing.current = false;
    }
  }, [sessionId, persistQueue]);

  // Load-once payload + queue restore.
  useEffect(() => {
    queueRef.current = restoreQueue(sessionStorage.getItem(storageKey(sessionId)));
    let cancelled = false;
    fetch(`/api/coach/sessions/${sessionId}/live`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((p: LivePayload) => {
        if (cancelled) return;
        setPayload(p);
        setStage(stageFor(p.session.status));
        void flushNow(); // drain anything restored from a killed tab
      })
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, [sessionId, flushNow]);

  const capture = useCallback(
    (c: CaptureInput) => {
      queueRef.current = enqueueCapture(queueRef.current, c);
      persistQueue();
      void flushNow();
    },
    [persistQueue, flushNow],
  );

  const markAttendance = useCallback(
    (rosterId: string, status: AttendanceStatus) => {
      queueRef.current = enqueueAttendance(queueRef.current, rosterId, status);
      persistQueue();
      void flushNow();
    },
    [persistQueue, flushNow],
  );

  const consume = useCallback(
    (clientIds: string[]) => {
      queueRef.current = enqueueConsume(queueRef.current, clientIds);
      persistQueue();
      void flushNow();
    },
    [persistQueue, flushNow],
  );

  // Status transitions are optimistic: stage moves immediately, the PUT
  // retries in the background (server side is a retry-safe no-op).
  const transition = useCallback(
    async (status: "in_progress" | "completed", extra?: Record<string, unknown>) => {
      try {
        const res = await fetch(`/api/coach/sessions/${sessionId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, ...extra }),
        });
        if (!res.ok) throw new Error(String(res.status));
        if (pendingTransitionRef.current === status) pendingTransitionRef.current = null;
        setOffline(false);
        return true;
      } catch {
        if (status === "in_progress") pendingTransitionRef.current = "in_progress";
        setOffline(true);
        return false;
      }
    },
    [sessionId],
  );

  // Re-attempt a queued "in_progress" transition. In-flight guarded so the
  // online listener and the interval can't double-fire it concurrently.
  const retryPendingTransition = useCallback(async () => {
    if (!pendingTransitionRef.current || retryingTransition.current) return;
    retryingTransition.current = true;
    try {
      // transition() clears pendingTransitionRef on success.
      await transition(pendingTransitionRef.current);
    } finally {
      retryingTransition.current = false;
    }
  }, [transition]);

  // Reconnect + backoff flush (queued status transition first, then captures).
  useEffect(() => {
    const sync = () => {
      void retryPendingTransition().then(() => flushNow());
    };
    window.addEventListener("online", sync);
    const interval = setInterval(sync, 20_000);
    return () => {
      window.removeEventListener("online", sync);
      clearInterval(interval);
    };
  }, [flushNow, retryPendingTransition]);

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="w-full max-w-lg">
          <ErrorBanner message="Couldn't load this session. Check your connection and try again." />
          <button
            className="mt-4 min-h-11 w-full rounded-lg border px-4 font-medium"
            onClick={() => location.reload()}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }
  if (!payload) return <LoadingSkeleton />;

  const pendingCount =
    queueRef.current.captures.length + Object.keys(queueRef.current.attendance).length;

  return (
    <div className="mx-auto max-w-lg pb-24">
      {offline && (
        <div
          data-testid="offline-pill"
          role="status"
          aria-live="polite"
          className="sticky top-0 z-10 bg-amber-100 px-4 py-2 text-center text-sm text-amber-900"
        >
          Offline — {pendingCount > 0 ? `${pendingCount} unsaved, ` : ""}will sync when back
        </div>
      )}
      {stage === "cancelled" && (
        <div className="p-6 text-center">
          <p className="text-lg font-medium">This session was cancelled.</p>
          <a href="/coach/practices" className="mt-4 inline-block min-h-11 underline">
            Back to practices
          </a>
        </div>
      )}
      {stage === "setup" && (
        <SetupView
          payload={payload}
          onStart={async () => {
            setStage("field");
            setPayload((p) =>
              p ? { ...p, session: { ...p.session, status: "in_progress", startedAt: p.session.startedAt ?? new Date().toISOString() } } : p,
            );
            await transition("in_progress");
          }}
        />
      )}
      {stage === "field" && (
        <FieldMode
          payload={payload}
          queue={queueRef.current}
          onCapture={capture}
          onAttendance={markAttendance}
          onEnd={() => setStage("wrapup")}
        />
      )}
      {(stage === "wrapup" || stage === "done") && (
        <WrapUp
          payload={payload}
          queue={queueRef.current}
          readOnly={stage === "done"}
          onAttendance={markAttendance}
          onConsume={consume}
          onFinish={async (reflection) => {
            await flushNow();
            const ok = await transition("completed", reflection);
            if (ok) setStage("done");
            return ok;
          }}
        />
      )}
    </div>
  );
}
