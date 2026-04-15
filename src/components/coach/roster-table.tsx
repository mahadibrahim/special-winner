"use client"

import { useState, useEffect } from "react"
import {
  Users,
  Phone,
  Mail,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Search,
  MessageSquare,
  Plus,
  Loader2,
  User,
  Heart,
  Download,
  Grid,
  List
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface RosterPlayer {
  id: string
  jerseyNumber: string | null
  position: string | null
  status: "active" | "inactive" | "injured"
  notes: string | null
  player: {
    id: string
    firstName: string
    lastName: string
    birthDate: string
    age: number
    gender: string | null
    photoUrl: string | null
    medicalNotes: string | null
  }
  parent: {
    id: string
    firstName: string | null
    lastName: string | null
    email: string
    phone: string | null
  }
  emergencyContact: {
    name: string | null
    phone: string | null
  }
}

interface Team {
  id: string
  name: string
  maxRosterSize: number | null
}

const statusConfig: Record<string, { label: string; color: string; bgColor: string }> = {
  active: { label: "Active", color: "text-emerald-400", bgColor: "bg-emerald-500/20 border-emerald-500/30" },
  inactive: { label: "Inactive", color: "text-gray-400", bgColor: "bg-gray-500/20 border-gray-500/30" },
  injured: { label: "Injured", color: "text-red-400", bgColor: "bg-red-500/20 border-red-500/30" },
}

// Mock data for development
const mockRoster: RosterPlayer[] = [
  {
    id: "1",
    jerseyNumber: "10",
    position: "Forward",
    status: "active",
    notes: "Team captain",
    player: {
      id: "p1",
      firstName: "Emma",
      lastName: "Johnson",
      birthDate: "2016-04-15",
      age: 9,
      gender: "female",
      photoUrl: null,
      medicalNotes: null,
    },
    parent: {
      id: "u1",
      firstName: "Sarah",
      lastName: "Johnson",
      email: "sarah.johnson@email.com",
      phone: "(614) 555-0101",
    },
    emergencyContact: {
      name: "Mike Johnson",
      phone: "(614) 555-0102",
    },
  },
  {
    id: "2",
    jerseyNumber: "7",
    position: "Midfielder",
    status: "active",
    notes: null,
    player: {
      id: "p2",
      firstName: "Liam",
      lastName: "Williams",
      birthDate: "2016-08-22",
      age: 9,
      gender: "male",
      photoUrl: null,
      medicalNotes: "Asthma - has inhaler",
    },
    parent: {
      id: "u2",
      firstName: "Jennifer",
      lastName: "Williams",
      email: "jwilliams@email.com",
      phone: "(614) 555-0201",
    },
    emergencyContact: {
      name: "David Williams",
      phone: "(614) 555-0202",
    },
  },
  {
    id: "3",
    jerseyNumber: "3",
    position: "Defender",
    status: "injured",
    notes: "Sprained ankle - out 2 weeks",
    player: {
      id: "p3",
      firstName: "Olivia",
      lastName: "Brown",
      birthDate: "2016-01-10",
      age: 9,
      gender: "female",
      photoUrl: null,
      medicalNotes: null,
    },
    parent: {
      id: "u3",
      firstName: "Michael",
      lastName: "Brown",
      email: "mbrown@email.com",
      phone: "(614) 555-0301",
    },
    emergencyContact: {
      name: "Lisa Brown",
      phone: "(614) 555-0302",
    },
  },
  {
    id: "4",
    jerseyNumber: "1",
    position: "Goalkeeper",
    status: "active",
    notes: null,
    player: {
      id: "p4",
      firstName: "Noah",
      lastName: "Davis",
      birthDate: "2016-06-05",
      age: 9,
      gender: "male",
      photoUrl: null,
      medicalNotes: "Peanut allergy - EpiPen in bag",
    },
    parent: {
      id: "u4",
      firstName: "Amanda",
      lastName: "Davis",
      email: "amanda.d@email.com",
      phone: "(614) 555-0401",
    },
    emergencyContact: {
      name: "James Davis",
      phone: "(614) 555-0402",
    },
  },
]

const mockTeam: Team = {
  id: "1",
  name: "U10 Lightning",
  maxRosterSize: 15,
}

function PlayerCard({
  player,
  expanded,
  onToggleExpand,
  onAddNote
}: {
  player: RosterPlayer
  expanded: boolean
  onToggleExpand: () => void
  onAddNote: () => void
}) {
  const status = statusConfig[player.status]

  return (
    <div className={cn(
      "rounded-2xl bg-white/[0.02] border border-white/[0.06] overflow-hidden transition-all",
      expanded && "ring-1 ring-blue-500/30"
    )}>
      {/* Main Info */}
      <div className="p-4">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div className="relative">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
              <span className="text-lg font-bold text-white">
                {player.player.firstName[0]}{player.player.lastName[0]}
              </span>
            </div>
            {player.jerseyNumber && (
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                <span className="text-[10px] font-bold text-white">{player.jerseyNumber}</span>
              </div>
            )}
          </div>

          {/* Player Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-white">
                {player.player.firstName} {player.player.lastName}
              </h3>
              <Badge className={cn("text-[10px]", status.bgColor, status.color)}>
                {status.label}
              </Badge>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-500">
              {player.position && <span>{player.position}</span>}
              <span>Age {player.player.age}</span>
            </div>

            {/* Medical Alert */}
            {player.player.medicalNotes && (
              <div className="flex items-center gap-2 mt-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                <Heart className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                <span className="text-xs text-amber-400">{player.player.medicalNotes}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1">
            <button
              onClick={onAddNote}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              title="Add note"
            >
              <MessageSquare className="w-4 h-4 text-gray-500 hover:text-blue-400" />
            </button>
            <button
              onClick={onToggleExpand}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
            >
              {expanded ? (
                <ChevronUp className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Expanded Contact Info */}
      {expanded && (
        <div className="border-t border-white/[0.06] p-4 bg-white/[0.01]">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Parent Contact */}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Parent/Guardian</p>
              <div className="space-y-2">
                <p className="text-sm text-white">
                  {player.parent.firstName} {player.parent.lastName}
                </p>
                <a
                  href={`mailto:${player.parent.email}`}
                  className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
                >
                  <Mail className="w-3.5 h-3.5" />
                  {player.parent.email}
                </a>
                {player.parent.phone && (
                  <a
                    href={`tel:${player.parent.phone}`}
                    className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    {player.parent.phone}
                  </a>
                )}
              </div>
            </div>

            {/* Emergency Contact */}
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">Emergency Contact</p>
              {player.emergencyContact.name ? (
                <div className="space-y-2">
                  <p className="text-sm text-white">{player.emergencyContact.name}</p>
                  {player.emergencyContact.phone && (
                    <a
                      href={`tel:${player.emergencyContact.phone}`}
                      className="flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      {player.emergencyContact.phone}
                    </a>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-500">Not provided</p>
              )}
            </div>
          </div>

          {/* Coach Notes */}
          {player.notes && (
            <div className="mt-4 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Coach Notes</p>
              <p className="text-sm text-gray-300">{player.notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface RosterTableProps {
  teamId: string
}

export default function RosterTable({ teamId }: RosterTableProps) {
  const [roster, setRoster] = useState<RosterPlayer[]>([])
  const [team, setTeam] = useState<Team | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")

  useEffect(() => {
    fetchRoster()
  }, [teamId])

  const fetchRoster = async () => {
    try {
      setIsLoading(true)
      const response = await fetch(`/api/coach/teams/${teamId}/roster`)

      if (!response.ok) {
        throw new Error("Failed to fetch roster")
      }

      const data = await response.json()
      setRoster(data.roster.length > 0 ? data.roster : mockRoster)
      setTeam(data.team || mockTeam)
    } catch (err) {
      console.error("Error fetching roster:", err)
      // Fall back to mock data for development
      setRoster(mockRoster)
      setTeam(mockTeam)
      setError(null)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredRoster = roster.filter(player => {
    if (statusFilter !== "all" && player.status !== statusFilter) return false
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      const fullName = `${player.player.firstName} ${player.player.lastName}`.toLowerCase()
      const parentName = `${player.parent.firstName} ${player.parent.lastName}`.toLowerCase()
      return fullName.includes(query) || parentName.includes(query) || player.jerseyNumber?.includes(query)
    }
    return true
  })

  const handleAddNote = (_playerId: string) => {
    toast.info("Player notes editor coming soon", {
      description: "For now, use the parent dashboard's coach notes feature.",
    })
  }

  const handleExportRoster = () => {
    if (filteredRoster.length === 0) {
      toast.error("No players to export")
      return
    }

    const headers = [
      "Jersey",
      "Last Name",
      "First Name",
      "Position",
      "Status",
      "Age",
      "Gender",
      "Parent Name",
      "Parent Email",
      "Parent Phone",
      "Emergency Contact",
      "Emergency Phone",
      "Medical Notes",
      "Roster Notes",
    ]

    const escape = (value: string | null | undefined): string => {
      if (value == null) return ""
      const str = String(value)
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    const rows = filteredRoster.map((p) => [
      escape(p.jerseyNumber),
      escape(p.player.lastName),
      escape(p.player.firstName),
      escape(p.position),
      escape(p.status),
      escape(String(p.player.age)),
      escape(p.player.gender),
      escape(`${p.parent.firstName ?? ""} ${p.parent.lastName ?? ""}`.trim()),
      escape(p.parent.email),
      escape(p.parent.phone),
      escape(p.emergencyContact.name),
      escape(p.emergencyContact.phone),
      escape(p.player.medicalNotes),
      escape(p.notes),
    ])

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const filename = `roster-${team?.name?.replace(/\s+/g, "-").toLowerCase() ?? "team"}-${new Date().toISOString().slice(0, 10)}.csv`

    const link = document.createElement("a")
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    toast.success(`Exported ${filteredRoster.length} players to ${filename}`)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-16 px-6 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
        <h3 className="text-white font-medium mb-1">Unable to load roster</h3>
        <p className="text-sm text-gray-500 mb-4">{error}</p>
        <Button onClick={fetchRoster} variant="outline" className="border-white/10">
          Try Again
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-400" />
            Team Roster
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {filteredRoster.length} of {roster.length} players
            {team?.maxRosterSize && ` (max ${team.maxRosterSize})`}
          </p>
        </div>

        <Button
          onClick={handleExportRoster}
          variant="outline"
          className="border-white/10 text-gray-400 hover:text-white"
        >
          <Download className="w-4 h-4 mr-2" />
          Export
        </Button>
      </div>

      {/* Filters */}
      <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="text"
              placeholder="Search players..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-white placeholder:text-gray-600 text-sm focus:outline-none focus:border-blue-500/50 transition-colors"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-sm text-gray-300 focus:outline-none focus:border-blue-500/50"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="injured">Injured</option>
          </select>

          {/* View Mode Toggle */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-white/[0.03]">
            <button
              onClick={() => setViewMode("grid")}
              className={cn(
                "p-2 rounded-lg transition-all",
                viewMode === "grid" ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"
              )}
              title="Grid view"
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={cn(
                "p-2 rounded-lg transition-all",
                viewMode === "list" ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"
              )}
              title="List view"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Roster */}
      {filteredRoster.length === 0 ? (
        <div className="text-center py-16 px-6 rounded-2xl bg-white/[0.02] border border-white/[0.06]">
          <User className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <h3 className="text-white font-medium mb-1">No players found</h3>
          <p className="text-sm text-gray-500">
            {searchQuery ? "Try adjusting your search" : "No players have been assigned to this team yet"}
          </p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid gap-4 md:grid-cols-2">
          {filteredRoster.map(player => (
            <PlayerCard
              key={player.id}
              player={player}
              expanded={expandedId === player.id}
              onToggleExpand={() => setExpandedId(expandedId === player.id ? null : player.id)}
              onAddNote={() => handleAddNote(player.player.id)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRoster.map(player => (
            <PlayerCard
              key={player.id}
              player={player}
              expanded={expandedId === player.id}
              onToggleExpand={() => setExpandedId(expandedId === player.id ? null : player.id)}
              onAddNote={() => handleAddNote(player.player.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
