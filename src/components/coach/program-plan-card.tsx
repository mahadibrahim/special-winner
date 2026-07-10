"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ClipboardCheck, ChevronRight } from "lucide-react";

interface PendingPlan {
  attachmentId: string;
  seasonName: string;
  groupLabel: string;
  noun: string;
  sessionCount: number;
  earliestDate: string;
  distributorFirstName: string;
}

const MAX_PLANS_SHOWN = 3;

/**
 * Dashboard notification for Program Blueprint distribution (Task 5,
 * "Distribution" § "Coach notification" in
 * docs/superpowers/specs/2026-07-10-program-blueprint-design.md). Lists
 * recently-distributed curriculum sequences that landed sessions on the
 * coach's own team(s), deep-linking to the practices list. Mirrors
 * GlowsNudgeCard's fail-soft contract: renders nothing while loading, on
 * fetch error, or when nothing is pending.
 */
export function ProgramPlanCard() {
  const [pending, setPending] = useState<PendingPlan[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/coach/program-plan/nudge")
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
    <Card data-testid="program-plan-nudge" className="bg-cream border border-primary/20">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-primary/10">
            <ClipboardCheck className="w-4 h-4 text-primary" />
          </div>
          <span className="text-sm font-medium text-ink">New program plan 📋</span>
        </div>

        <div className="space-y-1.5">
          {pending.slice(0, MAX_PLANS_SHOWN).map((plan) => (
            <a
              key={plan.attachmentId}
              href="/coach/practices"
              className="flex items-center gap-2 p-2 rounded-lg bg-cream-2 hover:bg-cream-3 transition-colors group"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm text-ink truncate">
                  &ldquo;{plan.seasonName}&rdquo; — {plan.sessionCount}{" "}
                  {plan.sessionCount === 1 ? "session" : "sessions"} for your{" "}
                  {plan.noun}
                </p>
                <p className="text-xs text-ink/50 truncate">
                  from {plan.distributorFirstName}
                </p>
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-ink/40 flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
            </a>
          ))}
          {pending.length > MAX_PLANS_SHOWN && (
            <p className="text-xs text-ink/40 pl-2">
              +{pending.length - MAX_PLANS_SHOWN} more
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
