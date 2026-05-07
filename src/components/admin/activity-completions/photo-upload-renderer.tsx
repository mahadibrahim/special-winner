"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";

/**
 * Stub renderer for photo_upload activities.
 *
 * TODO(plan-4): The current `mediaAssets` schema has no `gameId` and no
 * `media_kind` column, so we cannot yet associate an uploaded asset with
 * a specific activity_completion based on the catalog's
 * `tracking_artifact.media_kind` (e.g. `signage_setup`, `field_setup`,
 * `flag_lines`, `field_condition_pregame`). Per-feature plans will
 * extend the media schema and replace this stub with a real
 * upload/select UI that POSTs `{ media_id }` to the shared submit
 * endpoint.
 *
 * Until then, expose a manual "mark complete (photos uploaded
 * out-of-band)" button so the activity-completion lifecycle can finish
 * end-to-end. The endpoint records the manual override in
 * `responsibleHistory` for auditability.
 */
export function PhotoUploadRenderer({
  completion,
  activity,
}: {
  completion: { id: string };
  activity: {
    name: string;
    description: string;
    tracking_artifact?: { media_kind?: string; min_count?: number };
  };
}) {
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function markComplete() {
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/admin/activity-completions/${completion.id}/mark-photo-out-of-band`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: note.trim() || undefined }),
        },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Submit failed (${res.status})`);
      }
      window.location.reload();
    } catch (e: any) {
      setErr(e.message ?? "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  const mediaKind = activity.tracking_artifact?.media_kind;
  const minCount = activity.tracking_artifact?.min_count;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <header>
        <h1 className="text-2xl font-bold">{activity.name}</h1>
        <p className="text-muted-foreground whitespace-pre-line">
          {activity.description}
        </p>
      </header>

      {err && <ErrorBanner message={err} />}

      <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 space-y-2">
        <div className="font-medium">Photo upload pending</div>
        <p>
          The full media-capture UX is coming in a follow-up plan. Until
          then, if photos for this activity were uploaded out-of-band you
          can manually mark this complete. The override is recorded in the
          activity's audit history.
        </p>
        {mediaKind && (
          <p className="text-xs">
            Required media kind: <code className="font-mono">{mediaKind}</code>
            {minCount ? ` × ${minCount}+` : ""}
          </p>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">
          Note (optional — recorded in history)
        </label>
        <input
          type="text"
          className="w-full border rounded p-2"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. uploaded via Drive folder XYZ"
        />
      </div>

      <Button onClick={markComplete} disabled={submitting}>
        {submitting ? "Marking..." : "Mark complete (photos uploaded out-of-band)"}
      </Button>
    </div>
  );
}
