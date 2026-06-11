"use client"

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ErrorBanner } from "@/components/ui/error-banner"
import { EmptyState } from "@/components/ui/empty-state"
import { LoadingSkeleton } from "@/components/ui/loading-skeleton"
import { toast } from "sonner"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"

/**
 * Coach → parent message composer. Pick one of YOUR teams, pick roster
 * members (or all), write, send. Delivery goes through the outbound
 * gateway server-side: each parent's preferred channel (SMS / email /
 * Telegram), opt-outs, and conversation logging all apply — replies show
 * up in the staff inbox.
 */

interface CoachTeam {
  id: string
  name: string
  season: { name: string; status: string } | null
}

interface RosterEntry {
  roster: { id: string; status: string }
  player: { firstName: string; lastName: string }
  parent: { firstName: string | null; lastName: string | null } | null
}

export default function CoachMessageComposer() {
  useHydrationBeacon()

  const [teams, setTeams] = useState<CoachTeam[]>([])
  const [teamsLoading, setTeamsLoading] = useState(true)
  const [teamId, setTeamId] = useState<string>("")

  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [rosterLoading, setRosterLoading] = useState(false)
  const [selectAll, setSelectAll] = useState(true)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())

  const [body, setBody] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastResult, setLastResult] = useState<{
    sentCount: number
    failedCount: number
    failed: Array<{ players: string[]; reason: string | null }>
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch("/api/coach/teams")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((j: { teams: CoachTeam[] }) => {
        if (cancelled) return
        setTeams(j.teams ?? [])
        if ((j.teams ?? []).length === 1) setTeamId(j.teams[0].id)
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your teams")
      })
      .finally(() => {
        if (!cancelled) setTeamsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!teamId) return
    let cancelled = false
    setRosterLoading(true)
    setSelectAll(true)
    setSelected(new Set())
    setLastResult(null)
    fetch(`/api/coach/teams/${teamId}/roster`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((j: { roster: RosterEntry[] }) => {
        if (cancelled) return
        setRoster(
          (j.roster ?? []).filter((r) => r.roster.status !== "inactive"),
        )
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the roster")
      })
      .finally(() => {
        if (!cancelled) setRosterLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [teamId])

  const toggleRoster = (rosterId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(rosterId)) next.delete(rosterId)
      else next.add(rosterId)
      return next
    })
  }

  const recipientCount = useMemo(() => {
    if (selectAll) return roster.length
    return selected.size
  }, [selectAll, selected, roster])

  const canSend =
    teamId !== "" && body.trim().length > 0 && recipientCount > 0 && !sending

  const handleSend = async () => {
    setSending(true)
    setError(null)
    setLastResult(null)
    try {
      const res = await fetch("/api/coach/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamId,
          rosterIds: selectAll ? "all" : Array.from(selected),
          body: body.trim(),
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "Send failed")
        return
      }
      setLastResult(json)
      if (json.failedCount === 0) {
        toast.success(`Sent to ${json.sentCount} parent${json.sentCount === 1 ? "" : "s"}`)
        setBody("")
      } else {
        toast.warning(
          `Sent to ${json.sentCount}, failed for ${json.failedCount} — details below`,
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error")
    } finally {
      setSending(false)
    }
  }

  if (teamsLoading) return <LoadingSkeleton />

  if (teams.length === 0) {
    return (
      <EmptyState
        title="No teams yet"
        description="Once you're assigned to a team, you can message your roster's parents here."
      />
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      {error && <ErrorBanner message={error} />}

      {/* Team picker */}
      <div className="space-y-1.5">
        <Label className="text-sm">Team</Label>
        <Select value={teamId} onValueChange={setTeamId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Pick a team" />
          </SelectTrigger>
          <SelectContent>
            {teams.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
                {t.season ? ` — ${t.season.name}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Recipients */}
      {teamId && (
        <div className="space-y-2">
          <Label className="text-sm">Recipients</Label>
          {rosterLoading ? (
            <LoadingSkeleton />
          ) : roster.length === 0 ? (
            <p className="text-sm text-ink-muted">
              No players on this roster yet.
            </p>
          ) : (
            <div className="border border-border rounded-lg divide-y divide-border">
              <div className="flex items-center gap-3 px-4 py-2.5 bg-cream-2">
                <Checkbox
                  id="recipients-all"
                  checked={selectAll}
                  onCheckedChange={(c) => setSelectAll(c === true)}
                />
                <Label htmlFor="recipients-all" className="text-sm cursor-pointer">
                  Whole roster ({roster.length} player
                  {roster.length === 1 ? "" : "s"})
                </Label>
              </div>
              {!selectAll &&
                roster.map((r) => (
                  <div key={r.roster.id} className="flex items-center gap-3 px-4 py-2">
                    <Checkbox
                      id={`r-${r.roster.id}`}
                      checked={selected.has(r.roster.id)}
                      onCheckedChange={() => toggleRoster(r.roster.id)}
                    />
                    <Label
                      htmlFor={`r-${r.roster.id}`}
                      className="text-sm cursor-pointer flex-1"
                    >
                      {r.player.firstName} {r.player.lastName}
                      {r.parent && (
                        <span className="text-ink-muted">
                          {" "}
                          — {r.parent.firstName} {r.parent.lastName}
                        </span>
                      )}
                    </Label>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Message */}
      <div className="space-y-1.5">
        <Label htmlFor="message-body" className="text-sm">
          Message
        </Label>
        <Textarea
          id="message-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          maxLength={4000}
          placeholder="Practice moved to 6pm tomorrow — same field."
        />
        <p className="text-xs text-ink-muted">
          Delivered by each parent's preferred channel (text, email, or
          Telegram). Replies land in the team inbox.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={handleSend} disabled={!canSend}>
          {sending
            ? "Sending…"
            : `Send to ${recipientCount} parent${recipientCount === 1 ? "" : "s"}`}
        </Button>
      </div>

      {/* Partial-failure detail */}
      {lastResult && lastResult.failedCount > 0 && (
        <div className="border border-border rounded-lg p-4 text-sm">
          <p className="font-medium text-ink mb-1">
            Couldn't reach {lastResult.failedCount} parent
            {lastResult.failedCount === 1 ? "" : "s"}:
          </p>
          <ul className="list-disc ml-5 text-ink-muted space-y-0.5">
            {lastResult.failed.map((f, i) => (
              <li key={i}>
                {f.players.join(", ")}
                {f.reason ? ` — ${f.reason.replace(/_/g, " ")}` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
