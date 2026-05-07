"use client";

import { Badge } from "@/components/ui/badge";

/**
 * Read-only view for counter_increment activities.
 *
 * These auto-complete via `counterAutoCompletePass` (Phase D) when the
 * underlying counter reaches min_count. The UI shows current state with
 * no submit affordance.
 */
export function CounterReadback({
  completion,
  activity,
}: {
  completion: {
    id: string;
    status: string;
    expectedAt: string | Date;
    completedAt?: string | Date | null;
  };
  activity: {
    name: string;
    description: string;
    tracking_artifact?: { counter?: string; min_count?: number };
  };
}) {
  const counter = activity.tracking_artifact?.counter;
  const minCount = activity.tracking_artifact?.min_count;
  const expected = new Date(completion.expectedAt).toLocaleString();
  const completedAt = completion.completedAt
    ? new Date(completion.completedAt).toLocaleString()
    : null;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{activity.name}</h1>
          <p className="text-muted-foreground whitespace-pre-line">
            {activity.description}
          </p>
        </div>
        <Badge variant="outline">{completion.status}</Badge>
      </header>

      <div className="rounded border bg-muted p-4 text-sm space-y-1">
        <p>
          This activity auto-completes when the underlying counter reaches its
          target. There is no manual submit.
        </p>
        {counter && (
          <p>
            Counter: <code className="font-mono">{counter}</code>
            {minCount !== undefined ? ` (target ≥ ${minCount})` : ""}
          </p>
        )}
        <p>Expected: {expected}</p>
        {completedAt && <p>Completed: {completedAt}</p>}
      </div>
    </div>
  );
}
