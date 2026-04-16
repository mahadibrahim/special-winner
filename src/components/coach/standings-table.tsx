import { useState, useEffect } from "react";
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  Loader2,
  AlertCircle,
  Medal,
  Target,
} from "lucide-react";

interface StandingEntry {
  id: string;
  teamId: string;
  teamName: string;
  teamColor: string | null;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  gamesPlayed: number;
  winPercentage: number;
  pointDifferential: number;
  rank: number;
  isCurrentTeam: boolean;
}

interface TeamInfo {
  id: string;
  name: string;
  color: string | null;
}

interface StandingsTableProps {
  teamId?: string;
  teams?: TeamInfo[];
}

// Mock data for development
const mockStandings: StandingEntry[] = [
  {
    id: "1",
    teamId: "team1",
    teamName: "Thunder",
    teamColor: "#3B82F6",
    wins: 8,
    losses: 2,
    ties: 0,
    pointsFor: 45,
    pointsAgainst: 22,
    gamesPlayed: 10,
    winPercentage: 0.8,
    pointDifferential: 23,
    rank: 1,
    isCurrentTeam: true,
  },
  {
    id: "2",
    teamId: "team2",
    teamName: "Lightning",
    teamColor: "#EAB308",
    wins: 7,
    losses: 3,
    ties: 0,
    pointsFor: 38,
    pointsAgainst: 25,
    gamesPlayed: 10,
    winPercentage: 0.7,
    pointDifferential: 13,
    rank: 2,
    isCurrentTeam: false,
  },
  {
    id: "3",
    teamId: "team3",
    teamName: "Storm",
    teamColor: "#8B5CF6",
    wins: 5,
    losses: 4,
    ties: 1,
    pointsFor: 30,
    pointsAgainst: 28,
    gamesPlayed: 10,
    winPercentage: 0.5,
    pointDifferential: 2,
    rank: 3,
    isCurrentTeam: false,
  },
  {
    id: "4",
    teamId: "team4",
    teamName: "Blaze",
    teamColor: "#EF4444",
    wins: 4,
    losses: 5,
    ties: 1,
    pointsFor: 27,
    pointsAgainst: 32,
    gamesPlayed: 10,
    winPercentage: 0.4,
    pointDifferential: -5,
    rank: 4,
    isCurrentTeam: false,
  },
  {
    id: "5",
    teamId: "team5",
    teamName: "Cyclone",
    teamColor: "#10B981",
    wins: 2,
    losses: 7,
    ties: 1,
    pointsFor: 18,
    pointsAgainst: 35,
    gamesPlayed: 10,
    winPercentage: 0.2,
    pointDifferential: -17,
    rank: 5,
    isCurrentTeam: false,
  },
  {
    id: "6",
    teamId: "team6",
    teamName: "Frost",
    teamColor: "#06B6D4",
    wins: 1,
    losses: 8,
    ties: 1,
    pointsFor: 12,
    pointsAgainst: 38,
    gamesPlayed: 10,
    winPercentage: 0.1,
    pointDifferential: -26,
    rank: 6,
    isCurrentTeam: false,
  },
];

export default function StandingsTable({ teamId, teams }: StandingsTableProps) {
  const [selectedTeamId, setSelectedTeamId] = useState<string>(teamId || teams?.[0]?.id || "");
  const [standings, setStandings] = useState<StandingEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [seasonName, setSeasonName] = useState<string>("");
  const [programName, setProgramName] = useState<string>("");

  useEffect(() => {
    if (selectedTeamId) {
      fetchStandings();
    }
  }, [selectedTeamId]);

  const fetchStandings = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/coach/teams/${selectedTeamId}/standings`);
      if (response.ok) {
        const data = await response.json();
        setStandings(data.standings || []);
        setSeasonName(data.season?.name || "");
        setProgramName(data.program?.name || "");
      } else {
        const data = await response.json();
        setError(data.error || "Failed to fetch standings");
        // Fall back to mock data in development
        setStandings(mockStandings);
      }
    } catch (err) {
      console.error("Error fetching standings:", err);
      setError("Failed to load standings");
      // Fall back to mock data in development
      setStandings(mockStandings);
    } finally {
      setIsLoading(false);
    }
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) {
      return (
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600">
          <Medal className="h-4 w-4 text-ink" />
        </div>
      );
    }
    if (rank === 2) {
      return (
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-gray-300 to-gray-500">
          <span className="text-sm font-bold text-ink">2</span>
        </div>
      );
    }
    if (rank === 3) {
      return (
        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-amber-600 to-amber-800">
          <span className="text-sm font-bold text-ink">3</span>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-cream-2">
        <span className="text-sm font-medium text-ink-muted">{rank}</span>
      </div>
    );
  };

  const getPointDiffIcon = (diff: number) => {
    if (diff > 0) return <TrendingUp className="h-4 w-4 text-green-400" />;
    if (diff < 0) return <TrendingDown className="h-4 w-4 text-red-400" />;
    return <Minus className="h-4 w-4 text-ink-muted" />;
  };

  const getPointDiffColor = (diff: number) => {
    if (diff > 0) return "text-green-400";
    if (diff < 0) return "text-red-400";
    return "text-ink-muted";
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-600 flex items-center justify-center">
            <Trophy className="h-6 w-6 text-ink" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-ink">Standings</h2>
            {seasonName && (
              <p className="text-sm text-ink-muted">
                {programName} - {seasonName}
              </p>
            )}
          </div>
        </div>

        {/* Team Selector (if multiple teams) */}
        {teams && teams.length > 1 && (
          <div className="relative">
            <select
              value={selectedTeamId}
              onChange={(e) => setSelectedTeamId(e.target.value)}
              className="appearance-none w-full sm:w-48 px-4 py-2 pr-10 bg-cream-2 border border-border rounded-lg text-ink text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted pointer-events-none" />
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-yellow-400 text-sm">
          <AlertCircle className="h-4 w-4" />
          {error} - Showing sample data
        </div>
      )}

      {/* Standings Table */}
      {standings.length === 0 ? (
        <div className="text-center py-12 text-ink-muted">
          <Trophy className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-lg font-medium">No standings available</p>
          <p className="text-sm mt-1">Standings will appear once games are completed</p>
        </div>
      ) : (
        <div className="bg-cream-2 border border-border rounded-2xl overflow-hidden">
          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-4 py-3 text-left text-xs font-medium text-ink-muted uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-ink-muted uppercase tracking-wider">
                    Team
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-ink-muted uppercase tracking-wider">
                    W
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-ink-muted uppercase tracking-wider">
                    L
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-ink-muted uppercase tracking-wider">
                    T
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-ink-muted uppercase tracking-wider">
                    GP
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-ink-muted uppercase tracking-wider">
                    Win %
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-ink-muted uppercase tracking-wider">
                    PF
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-ink-muted uppercase tracking-wider">
                    PA
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-ink-muted uppercase tracking-wider">
                    Diff
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {standings.map((team) => (
                  <tr
                    key={team.id}
                    className={`transition-colors hover:bg-cream-2 ${
                      team.isCurrentTeam ? "bg-primary/5" : ""
                    }`}
                  >
                    <td className="px-4 py-4">
                      {getRankBadge(team.rank)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: team.teamColor || "#666" }}
                        />
                        <span className={`font-medium ${team.isCurrentTeam ? "text-primary" : "text-ink"}`}>
                          {team.teamName}
                          {team.isCurrentTeam && (
                            <span className="ml-2 text-xs text-primary">(Your team)</span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center text-green-400 font-medium">
                      {team.wins}
                    </td>
                    <td className="px-4 py-4 text-center text-red-400 font-medium">
                      {team.losses}
                    </td>
                    <td className="px-4 py-4 text-center text-ink-muted font-medium">
                      {team.ties}
                    </td>
                    <td className="px-4 py-4 text-center text-ink-2">
                      {team.gamesPlayed}
                    </td>
                    <td className="px-4 py-4 text-center text-ink-2">
                      {(team.winPercentage * 100).toFixed(0)}%
                    </td>
                    <td className="px-4 py-4 text-center text-ink-2">
                      {team.pointsFor}
                    </td>
                    <td className="px-4 py-4 text-center text-ink-2">
                      {team.pointsAgainst}
                    </td>
                    <td className="px-4 py-4">
                      <div className={`flex items-center justify-center gap-1 ${getPointDiffColor(team.pointDifferential)}`}>
                        {getPointDiffIcon(team.pointDifferential)}
                        <span className="font-medium">
                          {team.pointDifferential > 0 ? "+" : ""}
                          {team.pointDifferential}
                        </span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-border">
            {standings.map((team) => (
              <div
                key={team.id}
                className={`p-4 ${team.isCurrentTeam ? "bg-primary/5" : ""}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {getRankBadge(team.rank)}
                    <div className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: team.teamColor || "#666" }}
                      />
                      <span className={`font-medium ${team.isCurrentTeam ? "text-primary" : "text-ink"}`}>
                        {team.teamName}
                      </span>
                    </div>
                  </div>
                  <div className={`flex items-center gap-1 ${getPointDiffColor(team.pointDifferential)}`}>
                    {getPointDiffIcon(team.pointDifferential)}
                    <span className="text-sm font-medium">
                      {team.pointDifferential > 0 ? "+" : ""}
                      {team.pointDifferential}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div>
                    <p className="text-xs text-ink-muted mb-1">Record</p>
                    <p className="text-sm font-medium text-ink">
                      {team.wins}-{team.losses}-{team.ties}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-muted mb-1">Win %</p>
                    <p className="text-sm font-medium text-ink">
                      {(team.winPercentage * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-muted mb-1">PF</p>
                    <p className="text-sm font-medium text-ink">{team.pointsFor}</p>
                  </div>
                  <div>
                    <p className="text-xs text-ink-muted mb-1">PA</p>
                    <p className="text-sm font-medium text-ink">{team.pointsAgainst}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-6 text-xs text-ink-muted">
        <div className="flex items-center gap-2">
          <span className="font-medium">W</span> = Wins
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium">L</span> = Losses
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium">T</span> = Ties
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium">GP</span> = Games Played
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium">PF</span> = Points For
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium">PA</span> = Points Against
        </div>
        <div className="flex items-center gap-2">
          <span className="font-medium">Diff</span> = Point Differential
        </div>
      </div>
    </div>
  );
}
