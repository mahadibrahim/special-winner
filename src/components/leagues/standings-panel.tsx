"use client";
import { useEffect, useState } from "react";
import type { Division } from "@/lib/leagues/division-filters";
import { trackStandingsDivisionSelected } from "@/lib/analytics/events";
import { cn } from "@/lib/utils";

type StandingRow = {
  teamId: string; teamName: string; played: number; won: number; drawn: number;
  lost: number; goalsFor: number; goalsAgainst: number; goalDiff: number; points: number;
};
type ResultRow = {
  id: string; playedAt: string; homeTeam: string; awayTeam: string;
  homeScore: number; awayScore: number;
};
type StandingsResponse = {
  season: { id: string; name: string; status: string; startDate: string } | null;
  rules: { allowDraws: boolean };
  standings: StandingRow[];
  results: ResultRow[];
};

const TIER_TEXT: Record<string, string> = { a: "text-ink", b: "text-primary", c: "text-ochre", d: "text-sage", open: "text-navy" };
const BARS_FOR: Record<string, number> = { a: 4, b: 3, c: 2, d: 1, open: 4 };

export function StandingsPanel({ divisions, weekStart, term }: { divisions: Division[]; weekStart: string; term: string }) {
  const [activeId, setActiveId] = useState<string | null>(divisions[0]?.seasonId ?? null);
  const [data, setData] = useState<StandingsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    fetch(`/api/public/league-standings?seasonId=${activeId}`)
      .then((r) => r.json())
      .then((d: StandingsResponse) => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [activeId]);

  if (divisions.length === 0) {
    return <p className="text-ink-muted text-sm">Divisions post once the season is set.</p>;
  }

  const allowDraws = data?.rules.allowDraws ?? true;
  const hasTable = !loading && !error && (data?.standings.some((r) => r.played > 0) ?? false);

  return (
    <div>
      <h2 className="font-display font-semibold text-2xl">Standings &amp; results</h2>
      <p className="text-ink-muted text-[13px] mt-0.5 mb-4">Live league table, updated as scores come in. Pick a division.</p>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <span className="font-mono text-[9px] tracking-widest uppercase text-ink-muted">Division</span>
        {divisions.map((d) => (
          <button
            key={d.seasonId}
            onClick={() => { trackStandingsDivisionSelected({ term, seasonId: d.seasonId }); setActiveId(d.seasonId); }}
            aria-pressed={activeId === d.seasonId}
            className={cn(
              "font-sans font-semibold text-xs px-3 py-1.5 rounded-lg border flex items-center gap-1.5",
              activeId === d.seasonId ? "bg-ink text-cream border-ink" : "bg-paper text-ink-muted border-cream-3",
            )}
          >
            <span className={cn("inline-flex items-end gap-0.5 h-3", TIER_TEXT[d.level])}>
              {[4, 7, 10, 13].map((h, i) => (
                <i key={i} style={{ height: h }} className={cn("w-0.5 rounded-sm block", i < (BARS_FOR[d.level] ?? 4) ? "bg-current" : "bg-cream-3")} />
              ))}
            </span>
            {d.name}
          </button>
        ))}
      </div>

      {error && <div className="bg-destructive/5 border border-destructive/20 text-ink-2 rounded-lg p-3 text-sm">Couldn't load standings. Please try again.</div>}

      {loading && (
        <div className="space-y-2" data-testid="standings-loading">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-9 rounded bg-cream-2 animate-pulse" />)}
        </div>
      )}

      {!loading && !error && !hasTable && (
        <div className="text-center py-10 border border-dashed border-cream-3 rounded-xl bg-paper">
          <div className="font-display font-semibold text-xl text-ink-2">Standings begin Week 1 — {weekStart}</div>
          <div className="text-[13px] text-ink-muted mt-1.5">Scores and the league table appear here once games start.</div>
        </div>
      )}

      {hasTable && data && (
        <div className="grid lg:grid-cols-[1.65fr_1fr] gap-7 items-start">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[460px] text-[13px] border-collapse" data-testid="standings-table">
              <thead>
                <tr className="text-ink-muted">
                  {["#", "Team", "P", "W", ...(allowDraws ? ["D"] : []), "L", "GF", "GA", "GD", "Pts"].map((h) => (
                    <th key={h} className={cn("font-mono text-[9.5px] tracking-wider uppercase py-2 px-1.5 border-b border-cream-3", h === "Team" ? "text-left pl-1" : "text-center")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.standings.map((r, i) => (
                  <tr key={r.teamId} className={cn(i === 0 && "bg-sage/[0.07]")}>
                    <td className={cn("text-center py-2.5 px-1.5 border-b border-cream-2 font-mono text-xs", i === 0 ? "text-sage" : "text-ink-muted")}>{i + 1}</td>
                    <td className="text-left pl-1 py-2.5 px-1.5 border-b border-cream-2 font-display font-semibold text-[14px] text-ink">{r.teamName}</td>
                    <td className="text-center py-2.5 px-1.5 border-b border-cream-2 tabular-nums">{r.played}</td>
                    <td className="text-center py-2.5 px-1.5 border-b border-cream-2 tabular-nums">{r.won}</td>
                    {allowDraws && <td className="text-center py-2.5 px-1.5 border-b border-cream-2 tabular-nums">{r.drawn}</td>}
                    <td className="text-center py-2.5 px-1.5 border-b border-cream-2 tabular-nums">{r.lost}</td>
                    <td className="text-center py-2.5 px-1.5 border-b border-cream-2 tabular-nums">{r.goalsFor}</td>
                    <td className="text-center py-2.5 px-1.5 border-b border-cream-2 tabular-nums">{r.goalsAgainst}</td>
                    <td className="text-center py-2.5 px-1.5 border-b border-cream-2 tabular-nums text-ink-muted">{r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}</td>
                    <td className="text-center py-2.5 px-1.5 border-b border-cream-2 tabular-nums font-sans font-bold text-ink">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="font-mono text-[11px] text-ink-muted mt-2.5">Pts {allowDraws ? "(3 win / 1 draw)" : "(per win)"} · tiebreak: head-to-head → GD → fewest conceded</p>
          </div>

          <div>
            <h3 className="font-mono text-[10px] tracking-wider uppercase text-ink-muted mb-2.5">Recent results</h3>
            <div className="flex flex-col gap-1.5">
              {data.results.slice(0, 8).map((m) => (
                <div key={m.id} className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 bg-paper border border-cream-3 rounded-lg px-2.5 py-2 text-[12.5px]">
                  <span className={cn("text-right", m.homeScore > m.awayScore ? "text-ink font-semibold" : "text-ink-2")}>{m.homeTeam}</span>
                  <span className="font-mono font-bold text-[13px] text-ink bg-cream-2 rounded px-2 py-0.5 whitespace-nowrap">{m.homeScore}–{m.awayScore}</span>
                  <span className={cn("text-left", m.awayScore > m.homeScore ? "text-ink font-semibold" : "text-ink-2")}>{m.awayTeam}</span>
                </div>
              ))}
              {data.results.length === 0 && <div className="text-ink-muted text-[12.5px]">No games played yet.</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
