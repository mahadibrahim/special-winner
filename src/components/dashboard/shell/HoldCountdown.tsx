"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";

/**
 * Live countdown badge for a pending-payment rental hold. Re-renders every
 * second; when the deadline passes it shows "Hold expired" and fires onExpire
 * once so the parent can reload.
 */
export function HoldCountdown({
  expiresAt,
  onExpire,
}: {
  expiresAt: string;
  onExpire: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const firedExpireRef = useRef(false);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const deadline = new Date(expiresAt).getTime();
  const remainingMs = deadline - now;
  if (remainingMs <= 0) {
    if (!firedExpireRef.current) {
      firedExpireRef.current = true;
      window.setTimeout(onExpire, 0);
    }
    return (
      <Badge variant="outline" className="bg-cream-3 text-ink-2 border-border">
        Hold expired
      </Badge>
    );
  }
  const totalSeconds = Math.floor(remainingMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const display = `${minutes}:${seconds.toString().padStart(2, "0")}`;
  const urgent = remainingMs < 2 * 60 * 1000;
  return (
    <Badge
      variant="outline"
      className={
        urgent
          ? "bg-rose-500/10 text-rose-700 border-rose-500/20"
          : "bg-amber-500/10 text-amber-700 border-amber-500/20"
      }
    >
      Pay within {display}
    </Badge>
  );
}
