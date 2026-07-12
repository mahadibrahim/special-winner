"use client";

import type { LivePayload } from "@/lib/sessions/types";

export default function SetupView({
  payload,
  onStart,
}: {
  payload: LivePayload;
  onStart: () => void;
}) {
  const { session, segments, equipment, roster } = payload;
  const absences = roster.filter(
    (r) => r.attendanceStatus === "absent" || r.attendanceStatus === "excused",
  );

  return (
    <div className="space-y-6 p-4">
      <header>
        <h1 className="text-2xl font-semibold text-ink">{session.title}</h1>
        <p className="text-sm text-ink-muted">
          {session.teamName} · {session.durationMinutes} min
          {session.prescribed
            ? ` · Program plan · from ${session.prescribed.distributorFirstName ?? "your director"}`
            : ""}
        </p>
      </header>

      {session.objectives.length > 0 && (
        <section>
          <h2 className="mb-2 font-medium text-ink">Tonight's focus</h2>
          <ul className="list-disc pl-5 text-sm text-ink">
            {session.objectives.map((o, i) => (
              <li key={`${i}-${o}`}>{o}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-medium text-ink">Plan</h2>
        <ol className="space-y-2" data-testid="setup-segments">
          {segments.map((s) => (
            <li key={s.order} className="rounded-xl border border-border bg-paper p-3">
              <div className="flex items-baseline justify-between">
                <span className="text-ink">
                  {s.name}
                  {s.activityName ? ` — ${s.activityName}` : ""}
                </span>
                <span className="text-sm text-ink-muted">{s.durationMinutes} min</span>
              </div>
              {s.activityDiagram && (
                <details className="mt-2">
                  <summary
                    data-testid={`setup-diagram-toggle-${s.order}`}
                    className="min-h-11 cursor-pointer list-none py-2 text-sm text-ink-muted underline"
                  >
                    Setup diagram
                  </summary>
                  <pre
                    data-testid={`setup-diagram-${s.order}`}
                    className="overflow-x-auto rounded-lg bg-cream-2 p-3 font-mono text-xs leading-snug text-ink"
                  >
                    {s.activityDiagram}
                  </pre>
                </details>
              )}
            </li>
          ))}
        </ol>
      </section>

      {equipment.length > 0 && (
        <section>
          <h2 className="mb-2 font-medium text-ink">Bring</h2>
          <ul className="space-y-1" data-testid="setup-equipment">
            {equipment.map((e, i) => (
              <li key={`${i}-${e}`}>
                <label className="flex min-h-11 items-center gap-3">
                  <input type="checkbox" className="size-5" />
                  <span className="text-ink">{e}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 font-medium text-ink">
          Your {session.groupNoun} ({roster.length})
        </h2>
        {absences.length > 0 && (
          <p className="text-sm text-ink-muted">
            Out today: {absences.map((a) => a.firstName).join(", ")}
          </p>
        )}
      </section>

      {session.prescribed && (
        <p className="text-sm text-ink-muted">
          Need to change something? You can adjust the plan on the{" "}
          <a className="underline" href={`/coach/practices/${session.id}`}>
            session page
          </a>
          . Changes show as "adapted" to your director — that's fine, you know
          your {session.groupNoun}.
        </p>
      )}

      <button
        data-testid="start-session"
        onClick={onStart}
        className="fixed inset-x-4 bottom-4 mx-auto min-h-14 w-[calc(100%-2rem)] max-w-lg rounded-xl bg-primary text-lg font-semibold text-white"
      >
        Start session
      </button>
    </div>
  );
}
