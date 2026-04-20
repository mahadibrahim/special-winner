"use client";

import { useEffect, useState } from "react";

type Job = {
  id: string;
  scheduledStart: string;
  status: string;
  sessionType: string;
  confirmedAt: string | null;
};

function section(jobs: Job[], title: string) {
  if (jobs.length === 0) return null;
  return (
    <div key={title} className="mt-6">
      <h2 className="font-serif text-xl">{title}</h2>
      <ul className="mt-2 space-y-2">
        {jobs.map((j) => (
          <li key={j.id} className="rounded-md border border-ink/10 bg-white/50 px-3 py-2 text-sm">
            <a href={`/media/jobs/${j.id}`} className="flex justify-between">
              <span>
                {new Date(j.scheduledStart).toLocaleString()} — {j.sessionType}
              </span>
              <span className="text-xs text-ink/60">{j.status}</span>
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function JobsList() {
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    fetch("/api/media/jobs")
      .then((r) => r.json())
      .then((j) => setJobs(j.jobs ?? []));
  }, []);

  const now = Date.now();
  const needsConfirm = jobs.filter((j) => !j.confirmedAt && j.status === "assigned");
  const confirmed = jobs.filter((j) => j.status === "confirmed");
  const today = jobs.filter(
    (j) =>
      new Date(j.scheduledStart).toDateString() === new Date().toDateString() &&
      !["cancelled", "published", "ready"].includes(j.status)
  );
  const upcoming = jobs.filter(
    (j) =>
      new Date(j.scheduledStart).getTime() > now &&
      !needsConfirm.includes(j) &&
      !confirmed.includes(j) &&
      !today.includes(j)
  );
  const past = jobs.filter((j) => new Date(j.scheduledStart).getTime() < now);

  return (
    <>
      {section(needsConfirm, "Needs confirmation")}
      {section(confirmed, "Confirmed")}
      {section(today, "Today")}
      {section(upcoming, "Upcoming")}
      {section(past, "Past")}
    </>
  );
}
