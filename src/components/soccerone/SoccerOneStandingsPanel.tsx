"use client";
import { useEffect, useState } from "react";
import { trackStandingsDivisionSelected } from "@/lib/analytics/events";

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

export interface StandingsDivision {
  seasonId: string;
  name: string;
}

/**
 * SoccerOne skin of components/leagues/standings-panel. Same
 * /api/public/league-standings contract, same designed pre-season state:
 * before any game is played this renders a dated promise ("Standings begin
 * Week 1 — {date}"), not an empty box, and fills in automatically once
 * scores land. computeStandings and the endpoint are shared — only the
 * shell differs per brand.
 */
export default function SoccerOneStandingsPanel({ divisions, weekStart, term }: {
  divisions: StandingsDivision[];
  weekStart: string;
  term: string;
}) {
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

  const allowDraws = data?.rules.allowDraws ?? true;
  const hasTable = !loading && !error && (data?.standings.some((r) => r.played > 0) ?? false);

  if (divisions.length === 0) {
    return <p className="so-st-muted">Divisions post once the season is set.</p>;
  }

  return (
    <div className="so-st">
      <style>{`
        .so-st-muted { color: rgba(255,255,255,0.45); font-size: 0.875rem; }
        .so-st-pick { display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center; margin-bottom: 1.1rem; }
        .so-st-chip { font-family: var(--so-font-mono); font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em; color: #fff; background: var(--so-surface); border: 1px solid var(--so-lime-a15); border-radius: 99px; padding: 0.4rem 0.8rem; cursor: pointer; }
        .so-st-chip.on { background: var(--so-lime); color: var(--so-ink); border-color: var(--so-lime); font-weight: 700; }
        .so-st-promise { text-align: center; padding: 2.2rem 1rem; border: 1px dashed var(--so-lime-a25); border-radius: var(--so-radius-md); background: var(--so-lime-a04); }
        .so-st-promise-t { font-family: var(--so-font-display); font-size: 1.3rem; color: #fff; text-transform: uppercase; }
        .so-st-promise-s { font-size: 0.8rem; color: rgba(255,255,255,0.4); margin-top: 0.3rem; }
        .so-st-err { border: 1px solid var(--so-amber-a25); border-radius: var(--so-radius-md); color: var(--so-amber); font-size: 0.85rem; padding: 0.75rem 1rem; }
        .so-st-skel { height: 2.2rem; border-radius: var(--so-radius-sm); background: var(--so-lime-a08); margin-bottom: 0.4rem; animation: soPulse 1.5s ease-in-out infinite; }
        @keyframes soPulse { 50% { opacity: 0.5; } }
        @media (prefers-reduced-motion: reduce) { .so-st-skel { animation: none; } }
        .so-st-wrap { overflow-x: auto; }
        table.so-st-tbl { width: 100%; min-width: 460px; border-collapse: collapse; font-size: 0.8125rem; }
        .so-st-tbl th { font-family: var(--so-font-mono); font-size: 0.55rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--so-lime-a50); padding: 0.5rem 0.4rem; border-bottom: 1px solid var(--so-lime-a20); text-align: center; }
        .so-st-tbl th.l { text-align: left; }
        .so-st-tbl td { padding: 0.55rem 0.4rem; border-bottom: 1px solid rgba(255,255,255,0.05); color: rgba(255,255,255,0.65); text-align: center; font-variant-numeric: tabular-nums; }
        .so-st-tbl td.l { text-align: left; color: #fff; font-weight: 600; }
        .so-st-tbl td.pts { color: var(--so-lime); font-weight: 700; }
        .so-st-results { margin-top: 1.25rem; }
        .so-st-res-h { font-family: var(--so-font-mono); font-size: 0.6rem; letter-spacing: 0.12em; text-transform: uppercase; color: var(--so-lime-a50); margin-bottom: 0.5rem; }
        .so-st-res { display: flex; justify-content: space-between; gap: 0.75rem; font-size: 0.8125rem; color: rgba(255,255,255,0.6); padding: 0.4rem 0; border-bottom: 1px solid rgba(255,255,255,0.05); }
        .so-st-res b { color: #fff; font-variant-numeric: tabular-nums; }
      `}</style>

      {divisions.length > 1 && (
        <div className="so-st-pick" role="group" aria-label="Division">
          {divisions.map((d) => (
            <button
              key={d.seasonId}
              type="button"
              className={`so-st-chip ${activeId === d.seasonId ? "on" : ""}`}
              aria-pressed={activeId === d.seasonId}
              onClick={() => { trackStandingsDivisionSelected({ term, seasonId: d.seasonId }); setActiveId(d.seasonId); }}
            >
              {d.name}
            </button>
          ))}
        </div>
      )}

      {error && <div className="so-st-err">Couldn't load standings. Please try again.</div>}

      {loading && (
        <div data-testid="standings-loading">
          {[0, 1, 2, 3].map((i) => <div key={i} className="so-st-skel" />)}
        </div>
      )}

      {!loading && !error && !hasTable && (
        <div className="so-st-promise">
          <div className="so-st-promise-t">Standings begin Week 1 — {weekStart}</div>
          <div className="so-st-promise-s">Scores and the league table appear here once games start.</div>
        </div>
      )}

      {hasTable && data && (
        <>
          <div className="so-st-wrap">
            <table className="so-st-tbl" data-testid="standings-table">
              <thead>
                <tr>
                  <th>#</th><th className="l">Team</th><th>P</th><th>W</th>
                  {allowDraws && <th>D</th>}
                  <th>L</th><th>GF</th><th>GA</th><th>GD</th><th>Pts</th>
                </tr>
              </thead>
              <tbody>
                {data.standings.map((r, i) => (
                  <tr key={r.teamId}>
                    <td>{i + 1}</td><td className="l">{r.teamName}</td><td>{r.played}</td><td>{r.won}</td>
                    {allowDraws && <td>{r.drawn}</td>}
                    <td>{r.lost}</td><td>{r.goalsFor}</td><td>{r.goalsAgainst}</td><td>{r.goalDiff}</td>
                    <td className="pts">{r.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="so-st-results">
            <div className="so-st-res-h">Recent results</div>
            {data.results.length === 0 && <p className="so-st-muted">No games played yet.</p>}
            {data.results.map((g) => (
              <div key={g.id} className="so-st-res">
                <span>{g.homeTeam} vs {g.awayTeam}</span>
                <b>{g.homeScore}–{g.awayScore}</b>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
