"use client";

import { Badge } from "@/components/ui/badge";

/**
 * Read-only view for external_acknowledgment activities.
 *
 * These complete when an external system (Stripe, Telegram, Resend,
 * Quo, payroll) confirms a record. The platform observes the ack via
 * webhook/polling — there is no in-app submit affordance.
 */
export function ExternalAckReadback({
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
    tracking_artifact?: { external_system?: string; record_kind?: string };
  };
}) {
  const externalSystem = activity.tracking_artifact?.external_system;
  const recordKind = activity.tracking_artifact?.record_kind;
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
          This activity completes when an external system confirms the
          record. There is no in-app submit.
        </p>
        {externalSystem && (
          <p>
            External system: <code className="font-mono">{externalSystem}</code>
            {recordKind ? (
              <>
                {" "}— record kind: <code className="font-mono">{recordKind}</code>
              </>
            ) : null}
          </p>
        )}
        <p>Expected: {expected}</p>
        {completedAt && <p>Completed: {completedAt}</p>}
      </div>
    </div>
  );
}
