"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import type { CoachCandidate } from "@/lib/admin/coach-candidates";

/** Mirrors `setCoachesFor`'s cap (src/lib/coach/coaching-assignments.ts's
 *  `MAX_ASSISTANT_COACHES`) — kept as a local literal rather than importing
 *  server code into a client bundle. Only used to short-circuit the picker
 *  client-side; the server remains the actual enforcement point (422 on a
 *  request that ships more than this anyway). */
const MAX_ASSISTANTS = 2;

interface CoachAssignment {
  coachUserId: string;
  role: "lead" | "assistant";
  name: string;
}

interface SessionStaffing {
  sessionId: string;
  startsAt: string;
  coaches: CoachAssignment[];
}

interface StaffingResponse {
  templateCoaches: CoachAssignment[];
  sessions: SessionStaffing[];
}

interface TemplateStaffingProps {
  templateId: string;
  candidates: CoachCandidate[];
}

function candidateLabel(c: CoachCandidate): string {
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ");
  return name || c.email;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function errorMessageFrom(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const b = body as { message?: unknown; error?: unknown };
    if (typeof b.message === "string") return b.message;
    if (typeof b.error === "string") return b.error;
  }
  return fallback;
}

export default function TemplateStaffing({ templateId, candidates }: TemplateStaffingProps) {
  // Top-level client:load island on this page per repo convention — lets
  // tests/e2e/coach-classes.spec.ts use waitForHydration() before clicking.
  useHydrationBeacon();

  const [data, setData] = useState<StaffingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [leadDraft, setLeadDraft] = useState<string>("");
  const [assistantsDraft, setAssistantsDraft] = useState<string[]>([]);
  const [applyToMaterialized, setApplyToMaterialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [sessionLeadDraft, setSessionLeadDraft] = useState<string>("");
  const [sessionAssistantsDraft, setSessionAssistantsDraft] = useState<string[]>([]);
  const [sessionSaving, setSessionSaving] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/classes/templates/${templateId}/coaches`);
      if (!res.ok) throw new Error("Failed to load staffing");
      const json = (await res.json()) as StaffingResponse;
      setData(json);
      const lead = json.templateCoaches.find((c) => c.role === "lead");
      setLeadDraft(lead?.coachUserId ?? "");
      setAssistantsDraft(
        json.templateCoaches.filter((c) => c.role === "assistant").map((c) => c.coachUserId),
      );
    } catch {
      setLoadError("Couldn't load staffing. Try refreshing.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId]);

  function toggleAssistant(id: string) {
    setAssistantsDraft((prev) => {
      if (prev.includes(id)) return prev.filter((a) => a !== id);
      if (prev.length >= MAX_ASSISTANTS) {
        toast.error(`At most ${MAX_ASSISTANTS} assistant coaches are allowed`);
        return prev;
      }
      return [...prev, id];
    });
  }

  function toggleSessionAssistant(id: string) {
    setSessionAssistantsDraft((prev) => {
      if (prev.includes(id)) return prev.filter((a) => a !== id);
      if (prev.length >= MAX_ASSISTANTS) {
        toast.error(`At most ${MAX_ASSISTANTS} assistant coaches are allowed`);
        return prev;
      }
      return [...prev, id];
    });
  }

  async function saveTemplate() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/admin/classes/templates/${templateId}/coaches`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lead: leadDraft || null,
          assistants: assistantsDraft,
          applyToMaterialized,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = errorMessageFrom(body, "Save failed");
        setSaveError(message);
        toast.error(message);
        return;
      }
      const sessionsUpdated = (body as { sessionsUpdated?: number }).sessionsUpdated ?? 0;
      toast.success(
        applyToMaterialized
          ? `Staffing saved · ${sessionsUpdated} upcoming session${sessionsUpdated === 1 ? "" : "s"} updated`
          : "Staffing saved",
      );
      setApplyToMaterialized(false);
      await load();
    } catch {
      const message = "Save failed — try again.";
      setSaveError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  function startEditingSession(session: SessionStaffing) {
    setEditingSessionId(session.sessionId);
    setSessionError(null);
    const lead = session.coaches.find((c) => c.role === "lead");
    setSessionLeadDraft(lead?.coachUserId ?? "");
    setSessionAssistantsDraft(
      session.coaches.filter((c) => c.role === "assistant").map((c) => c.coachUserId),
    );
  }

  async function saveSession(sessionId: string) {
    setSessionSaving(true);
    setSessionError(null);
    try {
      const res = await fetch(`/api/admin/classes/sessions/${sessionId}/coaches`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lead: sessionLeadDraft || null, assistants: sessionAssistantsDraft }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = errorMessageFrom(body, "Save failed");
        setSessionError(message);
        toast.error(message);
        return;
      }
      toast.success("Session staffing updated");
      setEditingSessionId(null);
      await load();
    } catch {
      const message = "Save failed — try again.";
      setSessionError(message);
      toast.error(message);
    } finally {
      setSessionSaving(false);
    }
  }

  if (loading) {
    return (
      <div data-testid="staffing-panel" className="max-w-2xl space-y-6">
        <LoadingSkeleton rows={4} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div data-testid="staffing-panel" className="max-w-2xl">
        <ErrorBanner message={loadError} />
      </div>
    );
  }

  const sessions = data?.sessions ?? [];

  return (
    <div data-testid="staffing-panel" className="max-w-2xl space-y-8">
      <section className="space-y-4">
        <h2 className="font-semibold text-ink text-lg">Coaching staff</h2>
        <p className="text-xs text-ink-muted -mt-2">
          Sets the default lead and assistant coaches for this class. New sessions
          materialized from this template inherit this set automatically.
        </p>

        {saveError && <ErrorBanner message={saveError} />}

        <div>
          <label htmlFor="staffing-lead" className="block text-sm font-medium text-ink mb-1">
            Lead coach
          </label>
          <select
            id="staffing-lead"
            data-testid="staffing-lead-select"
            className="w-full rounded-md border border-border bg-cream px-3 py-2 text-sm"
            value={leadDraft}
            onChange={(e) => setLeadDraft(e.target.value)}
          >
            <option value="">No lead assigned</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {candidateLabel(c)}
              </option>
            ))}
          </select>
        </div>

        <fieldset>
          <legend className="block text-sm font-medium text-ink mb-1">
            Assistant coaches (up to {MAX_ASSISTANTS})
          </legend>
          <div className="space-y-1 max-h-48 overflow-y-auto rounded-md border border-border p-2">
            {candidates.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  data-testid={`staffing-assistant-checkbox-${c.id}`}
                  checked={assistantsDraft.includes(c.id)}
                  onChange={() => toggleAssistant(c.id)}
                />
                {candidateLabel(c)}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex items-start gap-2 text-sm rounded-md border border-amber-300 bg-amber-50 p-3 text-amber-900">
          <input
            type="checkbox"
            data-testid="staffing-apply-to-materialized"
            checked={applyToMaterialized}
            onChange={(e) => setApplyToMaterialized(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Apply to already-scheduled sessions
            <span className="block text-xs">
              Overwrites the coach set on EVERY upcoming session for this class, including any
              you&apos;ve individually changed below. This does not merge with per-session
              changes — it replaces them.
            </span>
          </span>
        </label>

        <Button type="button" data-testid="staffing-save" onClick={saveTemplate} disabled={saving}>
          {saving ? "Saving…" : "Save staffing"}
        </Button>
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-ink text-lg">Upcoming sessions</h2>
        {sessions.length === 0 ? (
          <EmptyState
            title="No upcoming sessions"
            description="Sessions materialize from this class's weekly schedule."
            icon={<CalendarClock className="h-8 w-8" />}
          />
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => {
              const lead = session.coaches.find((c) => c.role === "lead");
              const assistants = session.coaches.filter((c) => c.role === "assistant");
              const isEditing = editingSessionId === session.sessionId;
              return (
                <div
                  key={session.sessionId}
                  data-testid="session-staffing-row"
                  className="rounded-lg border border-border bg-cream-2 p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-ink">
                        {formatDateTime(session.startsAt)}
                      </p>
                      <p className="text-xs text-ink-muted">
                        Lead: {lead?.name ?? "Unassigned"}
                        {assistants.length > 0 &&
                          ` · Assist: ${assistants.map((a) => a.name).join(", ")}`}
                      </p>
                    </div>
                    {!isEditing && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        data-testid="session-staffing-change"
                        onClick={() => startEditingSession(session)}
                      >
                        Change
                      </Button>
                    )}
                  </div>

                  {isEditing && (
                    <div className="space-y-2 border-t border-border pt-2">
                      {sessionError && <ErrorBanner message={sessionError} />}
                      <select
                        data-testid="session-staffing-lead-select"
                        className="w-full rounded-md border border-border bg-cream px-3 py-2 text-sm"
                        value={sessionLeadDraft}
                        onChange={(e) => setSessionLeadDraft(e.target.value)}
                      >
                        <option value="">No lead assigned</option>
                        {candidates.map((c) => (
                          <option key={c.id} value={c.id}>
                            {candidateLabel(c)}
                          </option>
                        ))}
                      </select>
                      <div className="space-y-1 max-h-32 overflow-y-auto rounded-md border border-border p-2">
                        {candidates.map((c) => (
                          <label key={c.id} className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              data-testid={`session-staffing-assistant-checkbox-${c.id}`}
                              checked={sessionAssistantsDraft.includes(c.id)}
                              onChange={() => toggleSessionAssistant(c.id)}
                            />
                            {candidateLabel(c)}
                          </label>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          data-testid="session-staffing-save"
                          onClick={() => saveSession(session.sessionId)}
                          disabled={sessionSaving}
                        >
                          {sessionSaving ? "Saving…" : "Save"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingSessionId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
