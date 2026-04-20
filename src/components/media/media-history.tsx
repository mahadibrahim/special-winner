"use client";

import { useEffect, useState } from "react";

type Job = {
  id: string;
  scheduledStart: string;
  status: string;
};

export function MediaHistory() {
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    fetch("/api/media/jobs")
      .then((r) => r.json())
      .then((j) =>
        setJobs(
          (j.jobs ?? []).filter(
            (x: Job) => new Date(x.scheduledStart).getTime() < Date.now()
          )
        )
      );
  }, []);

  return (
    <ul className="mt-4 space-y-2 text-sm">
      {jobs.map((j) => (
        <li key={j.id} className="rounded-md border border-ink/10 bg-white/50 px-3 py-2">
          {new Date(j.scheduledStart).toLocaleString()} — {j.status}
        </li>
      ))}
    </ul>
  );
}
