"use client";

import { useEffect, useMemo, useState } from "react";
import type { AttendanceStatus, CaptureInput, LivePayload } from "@/lib/sessions/types";
import type { QueueState } from "@/lib/sessions/capture-queue";
import { promptForSegment } from "@/lib/sessions/prompt-pool";
import { elapsedMinutes } from "@/lib/sessions/timer";

export default function FieldMode({
  payload,
  queue,
  onCapture,
  onAttendance,
  onEnd,
}: {
  payload: LivePayload;
  queue: QueueState;
  onCapture: (c: CaptureInput) => void;
  onAttendance: (rosterId: string, status: AttendanceStatus) => void;
  onEnd: () => void;
}) {
  const { session, segments, prompts, roster } = payload;
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [promptCycle, setPromptCycle] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [sheetRosterId, setSheetRosterId] = useState<string | null>(null);
  // Attendance sheet shows once on first entry unless every player already
  // has a recorded status (pre-marked or queued).
  const [showAttendance, setShowAttendance] = useState(() =>
    roster.some((r) => !r.attendanceStatus && !queue.attendance[r.rosterId]),
  );

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const segment = segments[segmentIndex] ?? segments[segments.length - 1];
  const elapsed = session.startedAt ? elapsedMinutes(session.startedAt, now) : 0;
  const prompt = useMemo(
    () => (segment ? promptForSegment(prompts, segment, promptCycle) : null),
    [prompts, segment, promptCycle],
  );
  const next = segments[segmentIndex + 1] ?? null;
  const statusFor = (rosterId: string): AttendanceStatus | null =>
    queue.attendance[rosterId] ?? roster.find((r) => r.rosterId === rosterId)?.attendanceStatus ?? null;

  return (
    <div data-testid="field-mode" className="flex min-h-screen flex-col gap-4 p-4">
      <p className="text-sm text-ink-muted">
        {session.title} · {Math.floor(elapsed)} min in
      </p>

      {segment && (
        <button
          data-testid="advance-segment"
          onClick={() => {
            setSegmentIndex((i) => Math.min(i + 1, segments.length - 1));
            setPromptCycle(0);
          }}
          className="min-h-11 rounded-xl border-2 border-border bg-paper p-6 text-left"
        >
          <p data-testid="current-segment" className="text-2xl font-semibold text-ink">
            {segment.name}
            {segment.activityName ? ` — ${segment.activityName}` : ""}
          </p>
          <p className="mt-1 text-ink-muted">
            {segment.durationMinutes} min
            {next ? ` · next: ${next.name}` : " · last block"}
          </p>
          {segment.notes && <p className="mt-2 text-sm text-ink">{segment.notes}</p>}
          <p className="mt-3 text-xs text-ink-muted">Tap when you move on</p>
        </button>
      )}

      {prompt && (
        <button
          data-testid="prompt-card"
          onClick={() => setPromptCycle((c) => c + 1)}
          className="min-h-11 rounded-xl bg-cream-2 p-4 text-left"
        >
          <p className="text-sm text-ink">{prompt.content}</p>
          <p data-testid="cycle-prompt" className="mt-2 text-xs text-ink-muted">
            Tap for another
          </p>
        </button>
      )}

      <section className="mt-auto">
        <p className="mb-2 text-sm font-medium text-ink">Spot something good?</p>
        <div className="flex flex-wrap gap-2">
          {roster.map((r) => (
            <button
              key={r.rosterId}
              data-testid={`player-chip-${r.rosterId}`}
              onClick={() => setSheetRosterId(r.rosterId)}
              className={`min-h-11 rounded-full border border-border bg-paper px-4 text-ink ${
                statusFor(r.rosterId) === "absent" || statusFor(r.rosterId) === "excused"
                  ? "opacity-40"
                  : ""
              }`}
            >
              {r.firstName}
            </button>
          ))}
        </div>
      </section>

      <button
        data-testid="end-session"
        onClick={onEnd}
        className="min-h-14 rounded-xl border-2 border-primary font-semibold text-primary"
      >
        End session
      </button>

      {sheetRosterId && (
        <CaptureSheet
          player={roster.find((r) => r.rosterId === sheetRosterId)!}
          glowChips={payload.glowChips.glows}
          onSave={(c) => {
            onCapture(c);
            setSheetRosterId(null);
          }}
          onClose={() => setSheetRosterId(null)}
        />
      )}

      {showAttendance && (
        <AttendanceSheet
          roster={roster}
          statusFor={statusFor}
          onMark={onAttendance}
          onDone={() => setShowAttendance(false)}
        />
      )}
    </div>
  );
}

function CaptureSheet({
  player,
  glowChips,
  onSave,
  onClose,
}: {
  player: { rosterId: string; firstName: string };
  glowChips: string[];
  onSave: (c: CaptureInput) => void;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const save = (kind: "glow" | "observation", noteText: string | null) =>
    onSave({
      clientId: crypto.randomUUID(),
      rosterId: player.rosterId,
      kind,
      skillId: null,
      note: noteText,
    });

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-end bg-ink/60"
      onClick={onClose}
    >
      <div
        className="w-full rounded-t-2xl bg-paper p-4 pb-8"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-3 text-lg font-semibold text-ink">{player.firstName}</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {glowChips.slice(0, 6).map((chip) => (
            <button
              key={chip}
              data-testid="capture-glow"
              onClick={() => save("glow", chip)}
              className="min-h-11 rounded-full border border-border px-4 text-ink"
            >
              {chip}
            </button>
          ))}
        </div>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          aria-label="Quick note"
          placeholder="Or a quick note…"
          maxLength={280}
          className="mb-3 min-h-11 w-full rounded-lg border border-border bg-paper px-3 text-ink"
        />
        <button
          data-testid="capture-save"
          disabled={!note.trim()}
          onClick={() => save("observation", note.trim())}
          className="min-h-11 w-full rounded-lg bg-primary font-medium text-white disabled:opacity-40"
        >
          Save note
        </button>
      </div>
    </div>
  );
}

function AttendanceSheet({
  roster,
  statusFor,
  onMark,
  onDone,
}: {
  roster: LivePayload["roster"];
  statusFor: (rosterId: string) => AttendanceStatus | null;
  onMark: (rosterId: string, status: AttendanceStatus) => void;
  onDone: () => void;
}) {
  return (
    <div
      data-testid="attendance-sheet"
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] overflow-y-auto bg-paper p-4"
    >
      <h2 className="mb-1 text-xl font-semibold text-ink">Who's here?</h2>
      <p className="mb-4 text-sm text-ink-muted">Everyone's marked present — tap to flip.</p>
      <ul className="space-y-2">
        {roster.map((r) => {
          const status = statusFor(r.rosterId) ?? "present";
          return (
            <li key={r.rosterId}>
              <button
                onClick={() => onMark(r.rosterId, status === "present" ? "absent" : "present")}
                className={`flex min-h-12 w-full items-center justify-between rounded-lg border border-border px-4 text-ink ${
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
      <button
        data-testid="attendance-done"
        onClick={() => {
          // Default-present: persist a mark for anyone still untouched.
          for (const r of roster) if (!statusFor(r.rosterId)) onMark(r.rosterId, "present");
          onDone();
        }}
        className="mt-4 min-h-14 w-full rounded-xl bg-primary font-semibold text-white"
      >
        Done
      </button>
    </div>
  );
}
