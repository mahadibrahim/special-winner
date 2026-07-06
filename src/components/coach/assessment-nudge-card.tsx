"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ClipboardList, ChevronRight } from "lucide-react";

type DueStatus = "due" | "overdue" | "never";

interface DuePlayer {
  familyMemberId: string;
  firstName: string;
  lastName: string;
  worstStatus: DueStatus;
}

interface DueTeam {
  teamId: string;
  teamName: string;
  players: DuePlayer[];
}

const STATUS_LABEL: Record<DueStatus, string> = {
  due: "Due",
  overdue: "Overdue",
  never: "Not yet assessed",
};

const STATUS_CLASS: Record<DueStatus, string> = {
  due: "bg-yellow-500/10 text-yellow-600 border-yellow-500/20",
  overdue: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  never: "bg-red-500/10 text-red-600 border-red-500/20",
};

const MAX_PLAYERS_SHOWN = 3;

/**
 * Phase 4 JIT nudge for the coach dashboard: players due / overdue / never
 * assessed per the domain cadence, deep-linking to the assess page. Dynamic
 * computed card (not a coach_prompts row — see the phase plan's Design
 * Decisions). Fail-soft: renders nothing while loading, on error, or when
 * nothing is due; recording assessments is the natural "dismissal".
 */
export function AssessmentNudgeCard() {
  const [teams, setTeams] = useState<DueTeam[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/coach/assessments/due")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setTeams(data?.teams ?? []);
      })
      .catch(() => {
        if (!cancelled) setTeams([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!teams || teams.length === 0) return null;

  return (
    <Card
      data-testid="assessment-nudge"
      className="bg-cream border border-yellow-500/20"
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-yellow-500/10">
            <ClipboardList className="w-4 h-4 text-yellow-600" />
          </div>
          <span className="text-sm font-medium text-ink">Assessments due</span>
        </div>

        {teams.map((team) => (
          <div key={team.teamId} className="space-y-1.5">
            <p className="text-sm text-ink/70">
              {team.players.length}{" "}
              {team.players.length === 1 ? "player" : "players"} on{" "}
              {team.teamName}{" "}
              {team.players.length === 1 ? "needs" : "need"} an assessment
            </p>
            {team.players.slice(0, MAX_PLAYERS_SHOWN).map((player) => (
              <a
                key={player.familyMemberId}
                href={`/coach/assess/${player.familyMemberId}?teamId=${team.teamId}`}
                className="flex items-center gap-2 p-2 rounded-lg bg-cream-2 hover:bg-cream-3 transition-colors group"
              >
                <span className="text-sm text-ink flex-1 truncate">
                  {player.firstName} {player.lastName}
                </span>
                <Badge
                  variant="secondary"
                  className={`border text-[10px] ${STATUS_CLASS[player.worstStatus]}`}
                >
                  {STATUS_LABEL[player.worstStatus]}
                </Badge>
                <ChevronRight className="w-3.5 h-3.5 text-ink/40 group-hover:translate-x-0.5 transition-transform" />
              </a>
            ))}
            {team.players.length > MAX_PLAYERS_SHOWN && (
              <p className="text-xs text-ink/40 pl-2">
                +{team.players.length - MAX_PLAYERS_SHOWN} more on this team
              </p>
            )}
          </div>
        ))}

        <a
          href="/coach/assessments"
          className="flex items-center gap-1 text-xs font-medium text-primary hover:gap-2 transition-all"
        >
          Open assessments
          <ChevronRight className="w-3 h-3" />
        </a>
      </CardContent>
    </Card>
  );
}
