"use client"

import { useCallback, useEffect, useState } from "react"
import { Users, Loader2, LogOut, RefreshCw, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

interface TeamGroup {
  id: string
  name: string
  status: string
  joined: boolean
  optedOut: boolean
}

/**
 * Parent-facing team groups panel. Lets a parent see which team groups
 * they belong to and leave/rejoin each one.
 *
 * Hides entirely if the parent has no group memberships.
 */
export function TeamGroupsPanel() {
  const [groups, setGroups] = useState<TeamGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<Record<string, boolean>>({})

  const fetchGroups = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/dashboard/team-groups")
      if (!res.ok) throw new Error(`Failed to load (${res.status})`)
      const data = await res.json()
      setGroups(data.teamGroups ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load team groups")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGroups()
  }, [fetchGroups])

  async function handleLeave(groupId: string) {
    setPending((p) => ({ ...p, [groupId]: true }))
    try {
      const res = await fetch(`/api/dashboard/team-groups/${groupId}/leave`, {
        method: "POST",
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Leave failed")
      }
      setGroups((gs) =>
        gs.map((g) =>
          g.id === groupId ? { ...g, joined: false, optedOut: true } : g,
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Leave failed")
    } finally {
      setPending((p) => ({ ...p, [groupId]: false }))
    }
  }

  async function handleRejoin(groupId: string) {
    setPending((p) => ({ ...p, [groupId]: true }))
    try {
      const res = await fetch(`/api/dashboard/team-groups/${groupId}/rejoin`, {
        method: "POST",
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Rejoin failed")
      }
      setGroups((gs) =>
        gs.map((g) =>
          g.id === groupId ? { ...g, joined: true, optedOut: false } : g,
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rejoin failed")
    } finally {
      setPending((p) => ({ ...p, [groupId]: false }))
    }
  }

  // Hide entirely while loading or when there are no groups — the panel
  // should only appear once there's something to show. This prevents a
  // perpetual spinner if hydration or the fetch stalls.
  if (loading || groups.length === 0) {
    return null
  }

  return (
    <div className="p-6 rounded-2xl bg-paper border border-border space-y-5">
      <header>
        <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          Team groups
        </h2>
        <p className="text-sm text-ink-muted mt-1">
          Your team's messaging groups. Leave or rejoin anytime — we'll handle the Telegram invite.
        </p>
      </header>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <ul className="space-y-3">
        {groups.map((group) => {
          const busy = !!pending[group.id]
          return (
            <li
              key={group.id}
              className="flex items-center gap-3 p-3 rounded-xl border border-border bg-cream-2"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-ink truncate">{group.name}</span>
                  {group.status === "active" && !group.optedOut && (
                    <Badge variant="outline" className="text-xs border-emerald-500/40 text-emerald-400">
                      Active
                    </Badge>
                  )}
                  {group.status === "pending" && (
                    <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-400">
                      Pending
                    </Badge>
                  )}
                  {group.optedOut && (
                    <Badge variant="outline" className="text-xs border-ink-faint text-ink-faint">
                      Left
                    </Badge>
                  )}
                </div>
              </div>

              {group.optedOut ? (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => handleRejoin(group.id)}
                  className="border-primary/30 text-primary hover:bg-primary/10 flex-shrink-0"
                >
                  {busy ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3 h-3 mr-1" />
                  )}
                  Rejoin
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() => handleLeave(group.id)}
                  className="border-border text-ink-muted hover:text-ink hover:bg-cream-2 flex-shrink-0"
                >
                  {busy ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <LogOut className="w-3 h-3 mr-1" />
                  )}
                  Leave
                </Button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
