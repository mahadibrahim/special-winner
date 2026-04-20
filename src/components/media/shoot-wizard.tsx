"use client";

import { useEffect, useState } from "react";

type StaffRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
};

export function ShootWizard() {
  const [step, setStep] = useState(1);
  const [scheduledStart, setScheduledStart] = useState("");
  const [scheduledEnd, setScheduledEnd] = useState("");
  const [sessionType, setSessionType] = useState<
    "game" | "team_posed" | "practice" | "event"
  >("game");
  const [assignedUserId, setAssignedUserId] = useState<string>("");
  const [rateCents, setRateCents] = useState<number>(7500);
  const [rateType, setRateType] = useState<"per_game" | "per_day" | "flat">(
    "per_game"
  );
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/media/staff")
      .then((r) => r.json())
      .then((j) => setStaff(j.staff ?? []));
  }, []);

  const submit = async () => {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/media/shoots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignedUserId,
        sessionType,
        scheduledStart: new Date(scheduledStart).toISOString(),
        scheduledEnd: new Date(scheduledEnd).toISOString(),
        rateType,
        rateCents,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(`Failed: ${res.status}`);
      return;
    }
    const json = await res.json();
    window.location.href = `/admin/media/shoots/${json.session.id}`;
  };

  return (
    <div className="mx-auto max-w-xl p-6">
      <h1 className="font-serif text-3xl">New shoot</h1>
      <p className="mt-1 text-sm text-ink/60">Step {step} of 3</p>

      {step === 1 && (
        <div className="mt-6 space-y-3">
          <label className="block text-sm">
            Start
            <input
              type="datetime-local"
              className="mt-1 block w-full rounded-md border border-ink/20 px-2 py-1"
              value={scheduledStart}
              onChange={(e) => setScheduledStart(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            End
            <input
              type="datetime-local"
              className="mt-1 block w-full rounded-md border border-ink/20 px-2 py-1"
              value={scheduledEnd}
              onChange={(e) => setScheduledEnd(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Type
            <select
              className="mt-1 block w-full rounded-md border border-ink/20 px-2 py-1"
              value={sessionType}
              onChange={(e) => setSessionType(e.target.value as any)}
            >
              <option value="game">Game</option>
              <option value="team_posed">Team posed</option>
              <option value="practice">Practice</option>
              <option value="event">Event</option>
            </select>
          </label>
          <button
            onClick={() => setStep(2)}
            disabled={!scheduledStart || !scheduledEnd}
            className="rounded-md bg-ink px-4 py-1.5 text-sm text-cream disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="mt-6 space-y-3">
          <label className="block text-sm">
            Photographer
            <select
              className="mt-1 block w-full rounded-md border border-ink/20 px-2 py-1"
              value={assignedUserId}
              onChange={(e) => setAssignedUserId(e.target.value)}
            >
              <option value="">—</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.firstName} {s.lastName} ({s.email})
                </option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setStep(1)}
              className="rounded-md border border-ink/20 px-4 py-1.5 text-sm"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!assignedUserId}
              className="rounded-md bg-ink px-4 py-1.5 text-sm text-cream disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="mt-6 space-y-3">
          <label className="block text-sm">
            Rate type
            <select
              className="mt-1 block w-full rounded-md border border-ink/20 px-2 py-1"
              value={rateType}
              onChange={(e) => setRateType(e.target.value as any)}
            >
              <option value="per_game">Per game</option>
              <option value="per_day">Per day</option>
              <option value="flat">Flat</option>
            </select>
          </label>
          <label className="block text-sm">
            Rate (cents)
            <input
              type="number"
              min={0}
              className="mt-1 block w-full rounded-md border border-ink/20 px-2 py-1"
              value={rateCents}
              onChange={(e) => setRateCents(Number(e.target.value))}
            />
          </label>
          {error && <p className="text-sm text-red-700">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => setStep(2)}
              className="rounded-md border border-ink/20 px-4 py-1.5 text-sm"
            >
              Back
            </button>
            <button
              onClick={submit}
              disabled={saving}
              className="rounded-md bg-ink px-4 py-1.5 text-sm text-cream disabled:opacity-40"
            >
              {saving ? "Saving…" : "Create shoot"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
