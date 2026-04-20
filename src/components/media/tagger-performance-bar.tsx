"use client";
import { useEffect, useState } from "react";

type Props = {
  tagsCreatedCount: number;
  sessionStartedAt: number;
  totalAssets: number;
  taggedAssets: number;
  queueDepth?: number;
};

export function TaggerPerformanceBar({
  tagsCreatedCount,
  sessionStartedAt,
  totalAssets,
  taggedAssets,
  queueDepth,
}: Props) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const elapsedMs = Math.max(1, now - sessionStartedAt);
  const elapsedMinutes = elapsedMs / 60_000;
  const tagsPerMinute = tagsCreatedCount / elapsedMinutes;

  const mm = Math.floor(elapsedMs / 60_000);
  const ss = Math.floor((elapsedMs % 60_000) / 1000)
    .toString()
    .padStart(2, "0");

  return (
    <div
      className="flex items-center gap-6 border-t bg-neutral-50 px-4 py-2 text-sm text-neutral-700"
      role="status"
      aria-label="Tagger performance"
      data-testid="tagger-performance-bar"
    >
      <span>
        <strong>{tagsPerMinute.toFixed(1)}</strong> tags/min
      </span>
      <span>
        <strong>
          {mm}:{ss}
        </strong>{" "}
        elapsed
      </span>
      <span>
        <strong>
          {taggedAssets}/{totalAssets}
        </strong>{" "}
        assets tagged
      </span>
      {typeof queueDepth === "number" && (
        <span>
          Queue depth: <strong>{queueDepth}</strong>
        </span>
      )}
    </div>
  );
}
