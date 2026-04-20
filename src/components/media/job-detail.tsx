"use client";

import { useEffect, useState } from "react";
import { Uploader } from "./Uploader";

type Job = {
  id: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
  sessionType: string;
  confirmedAt: string | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
};

export function JobDetail({ sessionId }: { sessionId: string }) {
  const [job, setJob] = useState<Job | null>(null);

  const load = async () => {
    const r = await fetch("/api/media/jobs");
    const j = await r.json();
    setJob((j.jobs ?? []).find((x: Job) => x.id === sessionId) ?? null);
  };
  useEffect(() => {
    load();
  }, [sessionId]);

  const confirm = async () => {
    await fetch(`/api/media/jobs/${sessionId}/confirm`, { method: "POST" });
    load();
  };

  const checkIn = async () => {
    const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
      })
    );
    await fetch(`/api/media/jobs/${sessionId}/check-in`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      }),
    });
    load();
  };

  const checkOut = async () => {
    await fetch(`/api/media/jobs/${sessionId}/check-out`, { method: "POST" });
    load();
  };

  if (!job) return <p className="text-sm text-ink/60">Loading…</p>;

  return (
    <div>
      <h1 className="font-serif text-3xl">
        {job.sessionType} — {new Date(job.scheduledStart).toLocaleString()}
      </h1>
      <p className="text-sm text-ink/60">Status: {job.status}</p>

      <div className="mt-4 flex gap-2">
        {!job.confirmedAt && (
          <button
            onClick={confirm}
            className="rounded-md bg-ink px-3 py-1.5 text-sm text-cream"
          >
            Confirm
          </button>
        )}
        {job.confirmedAt && !job.checkedInAt && (
          <button
            onClick={checkIn}
            className="rounded-md bg-ink px-3 py-1.5 text-sm text-cream"
            data-testid="check-in-btn"
          >
            Check in
          </button>
        )}
        {job.checkedInAt && !job.checkedOutAt && (
          <button
            onClick={checkOut}
            className="rounded-md border border-ink/20 px-3 py-1.5 text-sm"
            data-testid="check-out-btn"
          >
            End session
          </button>
        )}
      </div>

      {job.checkedInAt && (
        <div className="mt-6">
          <Uploader sessionId={sessionId} />
        </div>
      )}
    </div>
  );
}
