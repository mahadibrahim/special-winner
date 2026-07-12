import { useEffect, useRef, useState } from "react";

/** Interval poller that pauses while the tab is hidden and fires on re-show. */
export function useVisiblePoll(fn: () => void | Promise<void>, intervalMs: number) {
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const [lastRunAt, setLastRunAt] = useState<number | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | null = null;
    const run = () => {
      void fnRef.current();
      setLastRunAt(Date.now());
    };
    const start = () => {
      if (timer) return;
      timer = setInterval(run, intervalMs);
    };
    const stop = () => {
      if (timer) { clearInterval(timer); timer = null; }
    };
    const onVis = () => {
      if (document.visibilityState === "visible") { run(); start(); } else stop();
    };
    run();
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    return () => { stop(); document.removeEventListener("visibilitychange", onVis); };
  }, [intervalMs]);

  return { lastRunAt };
}
