"use client";

import { useEffect, useState } from "react";

type Session = {
  id: string;
  scheduledStart: string;
  scheduledEnd: string;
  status: string;
  sessionType: string;
  assignedUserId: string | null;
  checkedInAt: string | null;
  checkedOutAt: string | null;
};

export function ShootDetail({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [assetCount, setAssetCount] = useState<number>(0);

  const load = async () => {
    const res = await fetch(`/api/admin/media/shoots/${sessionId}`);
    const json = await res.json();
    setSession(json.session);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [sessionId]);

  if (!session) return <p className="p-6 text-sm text-ink/60">Loading…</p>;

  const cancel = async () => {
    await fetch(`/api/admin/media/shoots/${sessionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    load();
  };

  return (
    <div className="p-6">
      <h1 className="font-serif text-3xl">Shoot {session.id.slice(0, 8)}</h1>
      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-ink/60">Status</dt>
          <dd>{session.status}</dd>
        </div>
        <div>
          <dt className="text-ink/60">Type</dt>
          <dd>{session.sessionType}</dd>
        </div>
        <div>
          <dt className="text-ink/60">Scheduled</dt>
          <dd>
            {new Date(session.scheduledStart).toLocaleString()} →{" "}
            {new Date(session.scheduledEnd).toLocaleString()}
          </dd>
        </div>
        <div>
          <dt className="text-ink/60">Photographer</dt>
          <dd>{session.assignedUserId ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-ink/60">Checked in</dt>
          <dd>
            {session.checkedInAt
              ? new Date(session.checkedInAt).toLocaleString()
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-ink/60">Assets</dt>
          <dd data-testid="asset-count">{assetCount}</dd>
        </div>
      </dl>
      <button
        onClick={cancel}
        className="mt-6 rounded-md border border-red-600 px-3 py-1.5 text-sm text-red-700"
      >
        Cancel shoot
      </button>
    </div>
  );
}
