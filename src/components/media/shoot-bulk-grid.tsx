"use client";

import { useEffect, useState } from "react";

type Game = { id: string; scheduledAt: string; home?: string; away?: string };
type Staff = { id: string; firstName: string | null; lastName: string | null };

export function ShootBulkGrid() {
  const [games, setGames] = useState<Game[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [weekendStart, setWeekendStart] = useState<string>(() => {
    const d = new Date();
    const saturday = new Date(d);
    saturday.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
    return saturday.toISOString().slice(0, 10);
  });

  useEffect(() => {
    const from = new Date(weekendStart).toISOString();
    const to = new Date(
      new Date(weekendStart).getTime() + 2 * 86400_000
    ).toISOString();
    fetch(`/api/admin/games?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((j) => setGames(j.games ?? []))
      .catch(() => setGames([]));
    fetch("/api/admin/media/staff")
      .then((r) => r.json())
      .then((j) => setStaff(j.staff ?? []));
  }, [weekendStart]);

  const assign = async (gameId: string, userId: string) => {
    const game = games.find((g) => g.id === gameId);
    if (!game) return;
    const start = new Date(game.scheduledAt);
    const end = new Date(start.getTime() + 2 * 3600_000);
    await fetch("/api/admin/media/shoots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        assignedUserId: userId,
        gameId,
        sessionType: "game",
        scheduledStart: start.toISOString(),
        scheduledEnd: end.toISOString(),
      }),
    });
  };

  return (
    <div className="p-6">
      <h1 className="font-serif text-3xl">Weekend assignment</h1>
      <input
        type="date"
        value={weekendStart}
        onChange={(e) => setWeekendStart(e.target.value)}
        className="mt-2 rounded-md border border-ink/20 px-2 py-1 text-sm"
      />
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div>
          <h2 className="mb-2 font-serif text-xl">Games</h2>
          <ul className="space-y-2">
            {games.map((g) => (
              <li
                key={g.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("gameId", g.id)}
                className="rounded-md border border-ink/10 bg-white/50 px-3 py-2 text-sm"
              >
                {new Date(g.scheduledAt).toLocaleString()} — {g.home ?? "?"} vs {g.away ?? "?"}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="mb-2 font-serif text-xl">Photographers</h2>
          <ul className="space-y-2">
            {staff.map((s) => (
              <li
                key={s.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const gid = e.dataTransfer.getData("gameId");
                  if (gid) assign(gid, s.id);
                }}
                className="rounded-md border border-ink/10 bg-white/50 px-3 py-2 text-sm"
              >
                {s.firstName} {s.lastName} — drop games here
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
