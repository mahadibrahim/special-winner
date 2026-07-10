"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkles, ChevronRight } from "lucide-react";

interface PendingSession {
  sessionId: string;
  title: string;
  scheduledDate: string;
  teamName: string;
  playerCount: number;
}

const MAX_SESSIONS_SHOWN = 3;

/**
 * Dashboard nudge for Glows & Grows (Plan 2 Task 7,
 * docs/superpowers/specs/2026-07-09-glows-and-grows-design.md §4). Lists
 * past sessions still waiting on glows, deep-linking to the capture flow.
 * Mirrors AssessmentNudgeCard's fail-soft contract: renders nothing while
 * loading, on fetch error, or when nothing is pending — sharing glows is
 * the natural "dismissal", there's no separate dismiss affordance.
 */
export function GlowsNudgeCard() {
  const [pending, setPending] = useState<PendingSession[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/coach/glows/nudge")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setPending(data?.pending ?? []);
      })
      .catch(() => {
        if (!cancelled) setPending([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!pending || pending.length === 0) return null;

  return (
    <Card data-testid="glows-nudge" className="bg-cream border border-primary/20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <span className="text-sm font-medium text-ink">Share some glows ✨</span>
        </div>

        <div className="space-y-1.5">
          {pending.slice(0, MAX_SESSIONS_SHOWN).map((session) => (
            <a
              key={session.sessionId}
              href={`/coach/practices/${session.sessionId}/glows`}
              className="flex items-center gap-2 p-2 rounded-lg bg-cream-2 hover:bg-cream-3 transition-colors group"
            >
              <span className="text-sm text-ink flex-1 truncate">
                Glows &amp; Grows for {session.title} · {session.playerCount}{" "}
                {session.playerCount === 1 ? "player" : "players"}
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-ink/40 group-hover:translate-x-0.5 transition-transform" />
            </a>
          ))}
          {pending.length > MAX_SESSIONS_SHOWN && (
            <p className="text-xs text-ink/40 pl-2">
              +{pending.length - MAX_SESSIONS_SHOWN} more waiting
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
