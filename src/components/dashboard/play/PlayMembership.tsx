"use client";

import { useEffect, useState } from "react";
import { Shield, ClipboardList } from "lucide-react";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { DashboardCard } from "@/components/dashboard/shell/DashboardCard";
import type { StatusTone } from "@/lib/dashboard/dashboard-ui";

interface Team {
  id: string;
  name: string;
  color: string | null;
  seasonId: string;
  division: string | null;
  record: { wins: number; losses: number; ties: number };
}

interface StandingRow {
  seasonId: string;
  teamId: string;
  teamName: string;
  wins: number;
  losses: number;
  ties: number;
  gamesPlayed: number;
}

interface Registration {
  id: string;
  status: string;
  paymentStatus: string;
  season: { id: string; name: string; startDate: string; endDate: string };
  program: { id: string; name: string; slug: string };
  sport: { id: string; name: string; icon: string | null; color: string | null };
  location: { id: string; name: string; city: string | null };
}

function fmtRecord(record: { wins: number; losses: number; ties: number }): string {
  const base = `${record.wins}W-${record.losses}L`;
  return record.ties > 0 ? `${base}-${record.ties}T` : base;
}

function regStatusTone(status: string): StatusTone {
  if (status === "active" || status === "confirmed") return "confirmed";
  return "pending";
}

export default function PlayMembership() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);

  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingStandings, setLoadingStandings] = useState(true);
  const [loadingRegs, setLoadingRegs] = useState(true);

  const [errorTeams, setErrorTeams] = useState<string | null>(null);
  const [errorStandings, setErrorStandings] = useState<string | null>(null);
  const [errorRegs, setErrorRegs] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/dashboard/play/teams");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setTeams(json.teams ?? []);
      } catch (err) {
        setErrorTeams(err instanceof Error ? err.message : "Failed to load teams");
      } finally {
        setLoadingTeams(false);
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/dashboard/play/standings");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        setStandings(json.standings ?? []);
      } catch (err) {
        setErrorStandings(err instanceof Error ? err.message : "Failed to load standings");
      } finally {
        setLoadingStandings(false);
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/registrations?self=true");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        // Only show active/confirmed/waitlisted registrations (not cancelled)
        const all: Registration[] = json.registrations ?? [];
        setRegistrations(all.filter((r) => r.status !== "cancelled"));
      } catch (err) {
        setErrorRegs(err instanceof Error ? err.message : "Failed to load registrations");
      } finally {
        setLoadingRegs(false);
      }
    })();
  }, []);

  if (loadingTeams || loadingStandings || loadingRegs) return <LoadingSkeleton />;

  const hasTeams = teams.length > 0;

  // If all fetches failed AND there is nothing to display, surface the error instead
  // of the misleading empty state. If any data came through, keep rendering it.
  if (!hasTeams && registrations.length === 0 && (errorTeams || errorStandings || errorRegs)) {
    return (
      <ErrorBanner
        message={[errorTeams, errorStandings, errorRegs].filter(Boolean).join(" · ")}
      />
    );
  }

  if (!hasTeams && registrations.length === 0) {
    return (
      <EmptyState
        title="You're not on a team yet — browse adult leagues"
        description="Sign up for a league season and you'll see your team, record, and standings here."
      >
        <a
          href="/programs?audience=adult"
          className="inline-flex items-center text-sm font-medium text-primary underline"
        >
          Browse adult leagues
        </a>
      </EmptyState>
    );
  }

  // Group standings by seasonId so we can render one table per division
  const standingsBySeasonId = new Map<string, StandingRow[]>();
  for (const row of standings) {
    const existing = standingsBySeasonId.get(row.seasonId) ?? [];
    existing.push(row);
    standingsBySeasonId.set(row.seasonId, existing);
  }

  // Collect my team ids for highlighting in standings table
  const myTeamIds = new Set(teams.map((t) => t.id));

  return (
    <div className="space-y-6">
      {errorTeams && <ErrorBanner message={errorTeams} />}
      {errorStandings && <ErrorBanner message={errorStandings} />}
      {errorRegs && <ErrorBanner message={errorRegs} />}

      {/* Teams */}
      {hasTeams && (
        <section>
          <h3 className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted mb-3">
            My teams
          </h3>
          <ul className="space-y-3">
            {teams.map((team) => (
              <li key={team.id}>
                <DashboardCard
                  icon={Shield}
                  eyebrow="My team"
                  title={
                    <span className="flex items-center gap-2">
                      {team.color && (
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: team.color }}
                        />
                      )}
                      {team.name}
                    </span>
                  }
                  meta={
                    <>
                      {team.division ? `${team.division} · ` : ""}
                      <span className="font-mono">{fmtRecord(team.record)}</span>
                    </>
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Standings tables — one per season */}
      {standingsBySeasonId.size > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted mb-3">
            Standings
          </h3>
          <div className="space-y-4">
            {[...standingsBySeasonId.entries()].map(([seasonId, rows]) => (
              <div key={seasonId} className="overflow-x-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-cream-2 border-b border-border">
                      <th className="text-left px-3 py-2 font-semibold text-ink-muted text-xs uppercase tracking-wide">
                        Team
                      </th>
                      <th className="text-center px-3 py-2 font-semibold text-ink-muted text-xs uppercase tracking-wide w-10">
                        W
                      </th>
                      <th className="text-center px-3 py-2 font-semibold text-ink-muted text-xs uppercase tracking-wide w-10">
                        L
                      </th>
                      <th className="text-center px-3 py-2 font-semibold text-ink-muted text-xs uppercase tracking-wide w-10">
                        T
                      </th>
                      <th className="text-center px-3 py-2 font-semibold text-ink-muted text-xs uppercase tracking-wide w-12">
                        GP
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => {
                      const isMyTeam = myTeamIds.has(row.teamId);
                      return (
                        <tr
                          key={row.teamId}
                          className={[
                            i % 2 === 0 ? "bg-paper" : "bg-cream-2",
                            isMyTeam ? "font-semibold" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <td className="px-3 py-2 text-ink">
                            {isMyTeam && (
                              <span className="text-primary mr-1">▶</span>
                            )}
                            {row.teamName}
                          </td>
                          <td className="px-3 py-2 text-center text-ink">{row.wins}</td>
                          <td className="px-3 py-2 text-center text-ink">{row.losses}</td>
                          <td className="px-3 py-2 text-center text-ink">{row.ties}</td>
                          <td className="px-3 py-2 text-center text-ink-muted">{row.gamesPlayed}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Active registrations */}
      {registrations.length > 0 && (
        <section>
          <h3 className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted mb-3">
            Registrations
          </h3>
          <ul className="space-y-3">
            {registrations.map((reg) => (
              <li key={reg.id}>
                <DashboardCard
                  icon={ClipboardList}
                  eyebrow="League registration"
                  title={reg.program.name}
                  meta={`${reg.season.name} · ${reg.location.name}`}
                  status={{ label: reg.status, tone: regStatusTone(reg.status) }}
                  action={
                    <a
                      href={`/dashboard/registrations/${reg.id}`}
                      className="text-xs text-primary underline"
                    >
                      View
                    </a>
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
