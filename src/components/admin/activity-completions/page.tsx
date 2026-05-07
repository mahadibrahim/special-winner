"use client";

import { useEffect, useState } from "react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { ChecklistRenderer } from "./checklist-renderer";
import { FormRenderer } from "./form-renderer";
import { SignatureRenderer } from "./signature-renderer";
import { PhotoUploadRenderer } from "./photo-upload-renderer";
import { CounterReadback } from "./counter-readback";
import { SystemEventReadback } from "./system-event-readback";
import { ExternalAckReadback } from "./external-ack-readback";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";

/**
 * Branching component for an activity-completion detail page.
 *
 * Loads three things in sequence:
 *  1. The completion row (DB-backed, org-scoped via the admin endpoint)
 *  2. The activity definition (catalog YAML)
 *  3. The artifact template (only for checklist/form/signature)
 *
 * Then dispatches to the right renderer based on `activity.tracking_method`.
 */
export function ActivityCompletionPage({
  completionId,
}: {
  completionId: string;
}) {
  useHydrationBeacon();

  const [data, setData] = useState<{
    completion: any;
    activity: any;
    template: any;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cRes = await fetch(`/api/admin/activity-completions/${completionId}`);
        if (!cRes.ok) {
          throw new Error(`Failed to load completion (${cRes.status})`);
        }
        const completion = await cRes.json();

        const aRes = await fetch(`/api/catalog/activities/${completion.activityId}`);
        if (!aRes.ok) {
          throw new Error(`Failed to load activity definition (${aRes.status})`);
        }
        const activity = await aRes.json();

        let template: any = null;
        if (
          ["checklist", "form", "signature"].includes(activity.tracking_method)
        ) {
          const templateId = activity.tracking_artifact?.template_id;
          if (templateId) {
            const tRes = await fetch(`/api/catalog/artifacts/${templateId}`);
            if (!tRes.ok) {
              throw new Error(`Failed to load template (${tRes.status})`);
            }
            template = await tRes.json();
          }
        }

        if (!cancelled) setData({ completion, activity, template });
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? "Unexpected error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [completionId]);

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <ErrorBanner message={error} />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <LoadingSkeleton />
      </div>
    );
  }

  const { completion, activity, template } = data;

  switch (activity.tracking_method) {
    case "checklist":
      return (
        <ChecklistRenderer
          completion={completion}
          activity={activity}
          template={template}
        />
      );
    case "form":
      return (
        <FormRenderer
          completion={completion}
          activity={activity}
          template={template}
        />
      );
    case "signature":
      return (
        <SignatureRenderer
          completion={completion}
          activity={activity}
          template={template}
        />
      );
    case "photo_upload":
      return <PhotoUploadRenderer completion={completion} activity={activity} />;
    case "counter_increment":
      return <CounterReadback completion={completion} activity={activity} />;
    case "system_event":
      return <SystemEventReadback completion={completion} activity={activity} />;
    case "external_acknowledgment":
      return <ExternalAckReadback completion={completion} activity={activity} />;
    default:
      return (
        <div className="max-w-2xl mx-auto p-6">
          <ErrorBanner
            message={`Unknown tracking_method: ${activity.tracking_method}`}
          />
        </div>
      );
  }
}
