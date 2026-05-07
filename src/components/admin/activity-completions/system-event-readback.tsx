"use client";

import { Badge } from "@/components/ui/badge";

/**
 * Read-only view for system_event activities.
 *
 * These auto-complete via `markCompleteBySystemEvent` (Phase D) when the
 * declared event_type fires (e.g. evt.cancellation_broadcast_sent
 * triggered by the broadcast send code path). The UI shows current state
 * with no submit affordance.
 */
export function SystemEventReadback({
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
    tracking_artifact?: { event_type?: string };
  };
}) {
  const eventType = activity.tracking_artifact?.event_type;
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
          This activity auto-completes when its system event fires. There is
          no manual submit.
        </p>
        {eventType && (
          <p>
            Event: <code className="font-mono">{eventType}</code>
          </p>
        )}
        <p>Expected: {expected}</p>
        {completedAt && <p>Completed: {completedAt}</p>}
      </div>
    </div>
  );
}
