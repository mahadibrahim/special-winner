"use client";
import { useMemo, useState } from "react";

export type RosterEntry = {
  id: string;
  first_name: string;
  last_initial: string;
  jersey_number: string | null;
  photo_url: string | null;
};

type RosterSide = {
  team_id: string | null;
  team_name: string | null;
  players: RosterEntry[];
};

type Props = {
  home: RosterSide;
  away: RosterSide;
  activeSide: "home" | "away";
  onSideChange: (side: "home" | "away") => void;
  tagCountsByPlayer: Record<string, number>;
  taggedOnCurrent: Set<string>;
  onTogglePlayer: (familyMemberId: string) => void;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
};

export function TaggerRosterSidebar({
  home,
  away,
  activeSide,
  onSideChange,
  tagCountsByPlayer,
  taggedOnCurrent,
  onTogglePlayer,
  searchInputRef,
}: Props) {
  const [query, setQuery] = useState("");
  const active = activeSide === "home" ? home : away;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return active.players;
    return active.players.filter(
      (p) =>
        p.first_name.toLowerCase().includes(q) ||
        (p.jersey_number ?? "").toLowerCase().includes(q)
    );
  }, [active.players, query]);

  return (
    <aside
      className="flex h-full w-full flex-col border-l bg-white"
      data-testid="roster-sidebar"
    >
      <div className="flex border-b">
        <button
          type="button"
          onClick={() => onSideChange("home")}
          className={`flex-1 py-2 text-sm font-medium ${
            activeSide === "home"
              ? "border-b-2 border-black"
              : "text-neutral-500"
          }`}
          data-testid="tab-home"
        >
          Home{home.team_name ? ` — ${home.team_name}` : ""}
        </button>
        <button
          type="button"
          onClick={() => onSideChange("away")}
          className={`flex-1 py-2 text-sm font-medium ${
            activeSide === "away"
              ? "border-b-2 border-black"
              : "text-neutral-500"
          }`}
          data-testid="tab-away"
        >
          Away{away.team_name ? ` — ${away.team_name}` : ""}
        </button>
      </div>

      <div className="border-b p-2">
        <input
          ref={searchInputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search player (press . to focus)"
          className="w-full rounded border px-2 py-1 text-sm"
          data-testid="roster-search"
        />
      </div>

      <ul className="flex-1 overflow-y-auto">
        {filtered.map((p) => {
          const count = tagCountsByPlayer[p.id] ?? 0;
          const selected = taggedOnCurrent.has(p.id);
          return (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onTogglePlayer(p.id)}
                className={`flex w-full items-center gap-3 border-b px-3 py-2 text-left hover:bg-neutral-50 ${
                  selected ? "bg-emerald-50" : ""
                }`}
                data-testid={`roster-entry-${p.jersey_number ?? "NA"}`}
                data-player-id={p.id}
              >
                <span
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-neutral-900 text-sm font-bold text-white"
                  aria-label={`Jersey ${p.jersey_number ?? "—"}`}
                >
                  {p.jersey_number ?? "—"}
                </span>
                {p.photo_url ? (
                  <img
                    src={p.photo_url}
                    alt=""
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <span className="h-8 w-8 rounded-full bg-neutral-200" />
                )}
                <span className="flex-1 text-sm">
                  {p.first_name} {p.last_initial}.
                </span>
                <span className="text-xs text-neutral-500">{count}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
