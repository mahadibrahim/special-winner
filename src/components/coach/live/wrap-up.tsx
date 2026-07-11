"use client";

import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/ui/empty-state";
import type { AttendanceStatus, LivePayload } from "@/lib/sessions/types";
import type { QueueState } from "@/lib/sessions/capture-queue";

type CaptureDecision = "promote" | "keep" | "discard";

export interface WrapUpProps {
  payload: LivePayload;
  queue: QueueState;
  readOnly: boolean;
  onAttendance: (rosterId: string, status: AttendanceStatus) => void;
  onConsume: (clientIds: string[]) => void;
  onFinish: (reflection?: Record<string, unknown>) => Promise<boolean>;
}

export default function WrapUp({
  payload,
  queue,
  readOnly,
  onAttendance,
  onConsume,
  onFinish,
}: WrapUpProps) {
  const [step, setStep] = useState(0);
  const [decisions, setDecisions] = useState<Record<string, CaptureDecision>>({});
  const [worked, setWorked] = useState("");
  const [improve, setImprove] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [finished, setFinished] = useState(readOnly);
  // Once the glows POST has succeeded, a Finish retry (e.g. the completed
  // PUT failed offline) must NOT re-fire it — the endpoint has no client-key
  // idempotency, so a second POST would duplicate parent-visible coach_notes.
  const promotionDoneRef = useRef(false);

  const rosterByRosterId = useMemo(
    () => new Map(payload.roster.map((r) => [r.rosterId, r])),
    [payload.roster],
  );
  // Pending captures = server-known unconsumed + still-queued ones, minus
  // anything whose consumption is already queued (even if the flush that
  // records it server-side hasn't landed yet) — a capture queued for
  // consumption must not be re-offered.
  const captures = useMemo(() => {
    const server = payload.captures.filter((c) => !c.consumedAt);
    const queuedIds = new Set(queue.captures.map((c) => c.clientId));
    const consumedIds = new Set(queue.consumedClientIds);
    return [
      ...server.filter((c) => !queuedIds.has(c.clientId) && !consumedIds.has(c.clientId)),
      ...queue.captures.filter((c) => !consumedIds.has(c.clientId)),
    ];
  }, [payload.captures, queue.captures, queue.consumedClientIds]);

  if (finished) {
    return (
      <div data-testid="wrapup-done" className="p-6 text-center">
        <p className="text-2xl font-semibold text-ink">Session wrapped up 🎉</p>
        <p className="mt-2 text-ink-muted">Glows are on their way to families.</p>
        <a href="/coach/practices" className="mt-6 inline-block min-h-11 underline text-ink">
          Back to practices
        </a>
      </div>
    );
  }

  const statusFor = (rosterId: string): AttendanceStatus =>
    queue.attendance[rosterId] ??
    rosterByRosterId.get(rosterId)?.attendanceStatus ??
    "present";

  const finish = async () => {
    setFinishing(true);
    try {
      // 1. Promote decided glows through the existing endpoint — exactly
      // once. On a retry after a failed onFinish, skip straight to
      // consume + complete so coach_notes are never duplicated.
      const promote = captures.filter((c) => decisions[c.clientId] === "promote");
      if (!promotionDoneRef.current && promote.length > 0) {
        const mapped = promote
          .map((c) => {
            const player = rosterByRosterId.get(c.rosterId);
            if (!player) return null;
            const isChip = c.kind === "glow" && c.note && payload.glowChips.glows.includes(c.note);
            return {
              familyMemberId: player.familyMemberId,
              glows: isChip ? [c.note as string] : [payload.glowChips.glows[0]],
              note: isChip ? undefined : (c.note ?? undefined),
            };
          })
          .filter((e): e is { familyMemberId: string; glows: string[]; note: string | undefined } => e !== null);
        // The endpoint's batch validation rejects a duplicate familyMemberId
        // in one batch (see glows.ts POST) — a player with two captures both
        // promoted would otherwise 400 the whole batch and abort Finish.
        // Merge same-player entries (dedup glows, cap 3 per schema, join
        // notes) so multiple promotes per player land in one batch entry.
        const byPlayer = new Map<string, { familyMemberId: string; glows: string[]; note?: string }>();
        for (const e of mapped) {
          const existing = byPlayer.get(e.familyMemberId);
          if (!existing) {
            byPlayer.set(e.familyMemberId, { familyMemberId: e.familyMemberId, glows: [...e.glows], note: e.note });
            continue;
          }
          for (const g of e.glows) {
            // Chips past the schema's 3-glow cap are dropped silently by
            // design — the first three (in capture order) win.
            if (!existing.glows.includes(g) && existing.glows.length < 3) existing.glows.push(g);
          }
          if (e.note) {
            // Merged notes must respect the endpoint's 280-char cap or the
            // whole batch 400s.
            existing.note = (existing.note ? `${existing.note} · ${e.note}` : e.note).slice(0, 280);
          }
        }
        const entries = [...byPlayer.values()];
        if (entries.length > 0) {
          const res = await fetch(`/api/coach/sessions/${payload.session.id}/glows`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entries }),
          });
          if (!res.ok) throw new Error("glows failed");
        }
        promotionDoneRef.current = true;
      }
      // 2. Consume every decided capture (promote/keep/discard all consume).
      // Queued right after the successful promotion POST — before onFinish —
      // so consumption is durably enqueued (sessionStorage-backed) even when
      // the completed PUT then fails. Residual window: if the consume flush
      // AND sessionStorage are both lost before ever reaching the server, a
      // reload could re-offer already-promoted captures; server-side
      // idempotency on the glows endpoint would be the durable close —
      // deliberately out of scope here.
      const decided = captures.filter((c) => decisions[c.clientId]).map((c) => c.clientId);
      if (decided.length > 0) onConsume(decided);
      // 3. Complete + reflection.
      const ok = await onFinish({
        whatWorkedWell: worked.trim() || undefined,
        whatToImprove: improve.trim() || undefined,
      });
      if (!ok) {
        toast.error("No connection — everything's saved here. Try Finish again when you have signal.");
        return;
      }
      setFinished(true);
    } catch {
      toast.error("Couldn't finish just now — nothing was lost. Try again.");
    } finally {
      setFinishing(false);
    }
  };

  return (
    <div className="space-y-6 p-4">
      <h1 className="text-2xl font-semibold text-ink">Wrap up</h1>
      <p className="text-sm text-ink-muted">Step {step + 1} of 3</p>

      {step === 0 && (
        <section data-testid="wrapup-step-attendance">
          <h2 className="mb-2 font-medium text-ink">Who was here?</h2>
          <ul className="space-y-2">
            {payload.roster.map((r) => {
              const status = statusFor(r.rosterId);
              return (
                <li key={r.rosterId}>
                  <button
                    aria-pressed={status === "present"}
                    aria-label={`${r.firstName} ${r.lastName}: ${status}. Tap to mark ${
                      status === "present" ? "absent" : "present"
                    }`}
                    onClick={() =>
                      onAttendance(r.rosterId, status === "present" ? "absent" : "present")
                    }
                    className={`flex min-h-12 w-full items-center justify-between rounded-xl border border-border bg-paper px-4 text-ink ${
                      status === "present" ? "" : "bg-cream-2 opacity-60"
                    }`}
                  >
                    <span>
                      {r.firstName} {r.lastName}
                    </span>
                    <span className="text-sm">{status}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {step === 1 && (
        <section data-testid="wrapup-step-glows">
          <h2 className="mb-2 font-medium text-ink">Your captures ({captures.length})</h2>
          {captures.length === 0 && (
            <EmptyState
              title="Nothing captured"
              description="You can still share glows from the glows page after finishing."
            >
              <a
                className="min-h-11 underline text-ink"
                href={`/coach/practices/${payload.session.id}/glows`}
              >
                Go to glows page
              </a>
            </EmptyState>
          )}
          <ul className="space-y-3">
            {captures.map((c) => {
              const player = rosterByRosterId.get(c.rosterId);
              const decision = decisions[c.clientId];
              return (
                <li key={c.clientId} className="rounded-xl border border-border bg-paper p-3">
                  <p className="font-medium text-ink">{player?.firstName ?? "Player"}</p>
                  <p className="text-sm text-ink-muted">{c.note ?? c.kind}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(
                      [
                        ["promote", "Share with family"],
                        ["keep", "Keep private"],
                        ["discard", "Discard"],
                      ] as const
                    ).map(([d, label]) => (
                      <button
                        key={d}
                        data-testid={`capture-${d}-${c.clientId}`}
                        aria-pressed={decision === d}
                        onClick={() => setDecisions((prev) => ({ ...prev, [c.clientId]: d }))}
                        className={`min-h-11 rounded-full border border-border px-3 text-sm ${
                          decision === d ? "bg-primary text-white" : "bg-paper text-ink"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {step === 2 && (
        <section data-testid="wrapup-step-reflection" className="space-y-4">
          <div>
            <label className="mb-1 block font-medium text-ink" htmlFor="worked">
              What worked well? <span className="text-sm text-ink-muted">(optional)</span>
            </label>
            <textarea
              id="worked"
              value={worked}
              onChange={(e) => setWorked(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border bg-paper p-3 text-ink"
            />
          </div>
          <div>
            <label className="mb-1 block font-medium text-ink" htmlFor="improve">
              Anything to tweak next time?{" "}
              <span className="text-sm text-ink-muted">(optional)</span>
            </label>
            <textarea
              id="improve"
              value={improve}
              onChange={(e) => setImprove(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border bg-paper p-3 text-ink"
            />
          </div>
        </section>
      )}

      {step < 2 ? (
        <button
          data-testid="wrapup-next"
          onClick={() => setStep((s) => s + 1)}
          className="min-h-14 w-full rounded-xl bg-primary text-lg font-semibold text-white"
        >
          Next
        </button>
      ) : (
        <button
          data-testid="finish-session"
          disabled={finishing}
          onClick={finish}
          className="min-h-14 w-full rounded-xl bg-primary text-lg font-semibold text-white disabled:opacity-50"
        >
          {finishing ? "Finishing…" : "Finish"}
        </button>
      )}
    </div>
  );
}
