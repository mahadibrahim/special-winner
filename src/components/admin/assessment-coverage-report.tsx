"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { ClipboardCheck, Users } from "lucide-react";

interface DomainInfo {
  domainId: string;
  displayName: string;
  assessmentFrequency: string | null;
  thresholdDays: number | null;
}

interface TeamCoverage {
  teamId: string;
  teamName: string;
  seasonName: string;
  coachUserId: string | null;
  coachName: string | null;
  rosterCount: number;
  freshCount: number;
  dueCount: number;
  overdueCount: number;
  neverCount: number;
  coveragePct: number | null;
  neverAssessedPlayers: { familyMemberId: string; name: string }[];
}

interface CoachCoverage {
  coachUserId: string;
  coachName: string;
  teamCount: number;
  playerCount: number;
  freshCount: number;
  coveragePct: number | null;
  levelDistribution: { count: number; mean: number; stdDev: number } | null;
}

interface CoverageReport {
  generatedAt: string;
  domains: DomainInfo[];
  teams: TeamCoverage[];
  coaches: CoachCoverage[];
}

function coverageBadgeClass(pct: number | null): string {
  if (pct === null) return "bg-cream-2 text-ink/40 border-0";
  if (pct >= 80) return "bg-emerald-500/10 text-emerald-600 border-0";
  if (pct >= 40) return "bg-yellow-500/10 text-yellow-600 border-0";
  return "bg-red-500/10 text-red-600 border-0";
}

export function AssessmentCoverageReport() {
  useHydrationBeacon();
  const [report, setReport] = useState<CoverageReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/curriculum/assessment-coverage")
      .then(async (r) => {
        if (!r.ok) throw new Error("Failed to load the assessment coverage report");
        return r.json() as Promise<CoverageReport>;
      })
      .then(setReport)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load report"),
      )
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton rows={6} />;
  if (error) return <ErrorBanner message={error} />;
  if (!report || report.teams.length === 0) {
    return (
      <EmptyState
        title="No teams in running seasons"
        description="Coverage is computed for teams in open, closed, or active seasons. Once a season is running, per-team assessment staleness appears here."
      />
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-ink mb-2">Assessment Coverage</h1>
        <p className="text-muted-foreground">
          Which rosters have stale or missing assessments. Cadence per domain:{" "}
          {report.domains
            .map((d) =>
              d.thresholdDays
                ? `${d.displayName} every ${d.thresholdDays}d`
                : `${d.displayName} (no cadence)`,
            )
            .join(" · ")}
          . Due at the threshold, overdue at twice it. Visibility only — nothing
          here blocks coaches.
        </p>
      </div>

      {/* Per-team coverage */}
      <Card className="bg-paper border border-border">
        <CardHeader>
          <CardTitle className="text-ink flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5" />
            Teams
          </CardTitle>
          <CardDescription>
            A player is covered when every cadenced domain is fresh. "Never"
            means at least one domain has never been assessed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted uppercase tracking-wide border-b border-border">
                  <th className="py-2 pr-4">Team</th>
                  <th className="py-2 pr-4">Season</th>
                  <th className="py-2 pr-4">Coach</th>
                  <th className="py-2 pr-4">Roster</th>
                  <th className="py-2 pr-4">Covered</th>
                  <th className="py-2 pr-4">Due</th>
                  <th className="py-2 pr-4">Overdue</th>
                  <th className="py-2 pr-4">Never</th>
                  <th className="py-2">Never-assessed players</th>
                </tr>
              </thead>
              <tbody>
                {report.teams.map((team) => (
                  <tr key={team.teamId} className="border-b border-border/50 align-top">
                    <td className="py-2 pr-4 font-medium text-ink">{team.teamName}</td>
                    <td className="py-2 pr-4 text-ink/70">{team.seasonName}</td>
                    <td className="py-2 pr-4 text-ink/70">{team.coachName ?? "—"}</td>
                    <td className="py-2 pr-4 text-ink/70">{team.rosterCount}</td>
                    <td className="py-2 pr-4">
                      <Badge variant="secondary" className={coverageBadgeClass(team.coveragePct)}>
                        {team.coveragePct === null ? "—" : `${team.coveragePct}%`}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4 text-ink/70">{team.dueCount}</td>
                    <td className="py-2 pr-4 text-ink/70">{team.overdueCount}</td>
                    <td className="py-2 pr-4 text-ink/70">{team.neverCount}</td>
                    <td className="py-2 text-ink/70">
                      {team.neverAssessedPlayers.length === 0 ? (
                        "—"
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {team.neverAssessedPlayers.map((p) => (
                            <Badge
                              key={p.familyMemberId}
                              variant="secondary"
                              className="bg-red-500/10 text-red-600 border-0 text-xs"
                            >
                              {p.name}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Per-coach rollup */}
      <Card className="bg-paper border border-border">
        <CardHeader>
          <CardTitle className="text-ink flex items-center gap-2">
            <Users className="w-5 h-5" />
            Coaches
          </CardTitle>
          <CardDescription>
            Level distribution is the mean and spread (std dev) of the 1–5
            levels each coach has recorded — data display only. A very low
            spread with a high mean can indicate "everyone's a 5"; use the
            calibration guide, not this table, to coach the coach.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-ink-muted uppercase tracking-wide border-b border-border">
                  <th className="py-2 pr-4">Coach</th>
                  <th className="py-2 pr-4">Teams</th>
                  <th className="py-2 pr-4">Players</th>
                  <th className="py-2 pr-4">Covered</th>
                  <th className="py-2 pr-4">Assessments</th>
                  <th className="py-2 pr-4">Mean level</th>
                  <th className="py-2">Spread (σ)</th>
                </tr>
              </thead>
              <tbody>
                {report.coaches.map((coach) => (
                  <tr key={coach.coachUserId} className="border-b border-border/50">
                    <td className="py-2 pr-4 font-medium text-ink">{coach.coachName}</td>
                    <td className="py-2 pr-4 text-ink/70">{coach.teamCount}</td>
                    <td className="py-2 pr-4 text-ink/70">{coach.playerCount}</td>
                    <td className="py-2 pr-4">
                      <Badge variant="secondary" className={coverageBadgeClass(coach.coveragePct)}>
                        {coach.coveragePct === null ? "—" : `${coach.coveragePct}%`}
                      </Badge>
                    </td>
                    <td className="py-2 pr-4 text-ink/70">
                      {coach.levelDistribution?.count ?? 0}
                    </td>
                    <td className="py-2 pr-4 text-ink/70">
                      {coach.levelDistribution ? coach.levelDistribution.mean.toFixed(2) : "—"}
                    </td>
                    <td className="py-2 text-ink/70">
                      {coach.levelDistribution ? coach.levelDistribution.stdDev.toFixed(2) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
