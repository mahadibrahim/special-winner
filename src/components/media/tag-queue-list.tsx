"use client";
import { useEffect, useState } from "react";

type QueueItem = {
  session_id: string;
  session_type: string;
  scheduled_start: string | null;
  uploaded_at: string | null;
  asset_count: number;
  game: {
    id: string;
    home: string | null;
    away: string | null;
    scheduled_at: string | null;
  } | null;
};

export function TagQueueList() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [claiming, setClaiming] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/media/tag-queue", {
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      const json = await res.json();
      setItems(json.queue);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function claim(id: string) {
    setClaiming(id);
    try {
      const res = await fetch(`/api/admin/media/tag-queue/${id}/claim`, {
        method: "POST",
        credentials: "same-origin",
      });
      if (!res.ok) {
        alert(`Claim failed: ${res.status} ${await res.text()}`);
        return;
      }
      window.location.href = `/media/tag/${id}`;
    } finally {
      setClaiming(null);
    }
  }

  if (loading) return <p className="p-4 text-sm">Loading...</p>;
  if (error) return <p className="p-4 text-sm text-red-700">{error}</p>;
  if (items.length === 0)
    return (
      <p className="p-4 text-sm text-neutral-500">
        No sessions awaiting tagging.
      </p>
    );

  return (
    <div className="overflow-x-auto" data-testid="tag-queue-list">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-neutral-50 text-left">
            <th className="px-3 py-2">Matchup</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Scheduled</th>
            <th className="px-3 py-2">Uploaded</th>
            <th className="px-3 py-2">Assets</th>
            <th className="px-3 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr
              key={it.session_id}
              className="border-b"
              data-testid={`queue-row-${it.session_id}`}
            >
              <td className="px-3 py-2">
                {it.game
                  ? `${it.game.home ?? "Home"} vs ${it.game.away ?? "Away"}`
                  : "—"}
              </td>
              <td className="px-3 py-2">{it.session_type}</td>
              <td className="px-3 py-2">
                {it.scheduled_start
                  ? new Date(it.scheduled_start).toLocaleString()
                  : "—"}
              </td>
              <td className="px-3 py-2">
                {it.uploaded_at
                  ? new Date(it.uploaded_at).toLocaleString()
                  : "—"}
              </td>
              <td className="px-3 py-2">{it.asset_count}</td>
              <td className="px-3 py-2 text-right">
                <button
                  type="button"
                  onClick={() => claim(it.session_id)}
                  disabled={claiming === it.session_id}
                  className="rounded bg-black px-3 py-1.5 text-white hover:bg-neutral-800 disabled:opacity-50"
                  data-testid={`claim-button-${it.session_id}`}
                >
                  {claiming === it.session_id ? "Claiming..." : "Claim & tag"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
