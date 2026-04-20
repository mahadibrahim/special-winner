"use client";

import { useEffect, useState } from "react";

type Session = {
  id: string;
  scheduledStart: string;
  status: string;
  assignedUserId: string | null;
  sessionType: string;
  venueId: string | null;
};

export function ShootsList() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const qs = status ? `?status=${encodeURIComponent(status)}` : "";
    fetch(`/api/admin/media/shoots${qs}`)
      .then((r) => r.json())
      .then((j) => setSessions(j.sessions ?? []))
      .finally(() => setLoading(false));
  }, [status]);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl">Media shoots</h1>
        <div className="flex gap-2">
          <a
            href="/admin/media/shoots/new"
            className="rounded-md bg-ink px-3 py-1.5 text-sm text-cream"
          >
            New shoot
          </a>
          <a
            href="/admin/media/shoots/bulk"
            className="rounded-md border border-ink/20 px-3 py-1.5 text-sm"
          >
            Bulk weekend
          </a>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        {["", "assigned", "confirmed", "checked_in", "uploaded", "cancelled"].map(
          (s) => (
            <button
              key={s || "all"}
              onClick={() => setStatus(s)}
              className={`rounded-full border px-3 py-1 text-xs ${
                status === s ? "bg-ink text-cream" : "border-ink/20"
              }`}
            >
              {s || "All"}
            </button>
          )
        )}
      </div>

      {loading ? (
        <p className="mt-6 text-sm text-ink/60">Loading…</p>
      ) : (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="text-left text-ink/60">
              <th className="py-2">When</th>
              <th>Type</th>
              <th>Status</th>
              <th>Photographer</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id} className="border-t border-ink/10">
                <td className="py-2">
                  {new Date(s.scheduledStart).toLocaleString()}
                </td>
                <td>{s.sessionType}</td>
                <td>{s.status}</td>
                <td>{s.assignedUserId ?? "—"}</td>
                <td>
                  <a
                    href={`/admin/media/shoots/${s.id}`}
                    className="text-ink underline"
                  >
                    View
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
