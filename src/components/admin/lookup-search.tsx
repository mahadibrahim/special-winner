"use client"

import { useEffect, useState } from "react"
import { Search, Loader2, Mail, ShieldCheck, UserRound } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"

type UserResult = {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  emailVerified: boolean
  roles: string[]
}

type PersonResult = {
  id: string
  firstName: string
  lastName: string
  birthDate: string
  parentUserId: string | null
  selfUserId: string | null
}

type LookupResponse = {
  users: UserResult[]
  people: PersonResult[]
  note?: string
}

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  location_admin: "Location Admin",
  coach: "Coach",
  parent: "Parent",
  player: "Player",
  media_staff: "Media",
  media_editor: "Media Editor",
}

export function LookupSearch() {
  useHydrationBeacon()
  const [q, setQ] = useState("")
  const [debounced, setDebounced] = useState("")
  const [data, setData] = useState<LookupResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])

  useEffect(() => {
    let alive = true
    if (debounced.length < 2) {
      setData(null)
      setIsLoading(false)
      setError(null)
      return
    }
    setIsLoading(true)
    setError(null)
    fetch(`/api/admin/lookup?q=${encodeURIComponent(debounced)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return (await r.json()) as LookupResponse
      })
      .then((json) => {
        if (!alive) return
        setData(json)
      })
      .catch((err) => {
        if (!alive) return
        console.error("[lookup] fetch failed:", err)
        setError("Search failed — please try again.")
      })
      .finally(() => {
        if (alive) setIsLoading(false)
      })
    return () => {
      alive = false
    }
  }, [debounced])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Look up</h1>
        <p className="text-gray-600 mt-1">
          Find accounts and players in this organization by name or email.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name or email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
          autoFocus
        />
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Searching…
        </div>
      )}

      {error && (
        <div className="text-sm text-rose-700">{error}</div>
      )}

      {!isLoading && !error && debounced.length >= 2 && data && (
        <ResultsView data={data} />
      )}

      {debounced.length === 0 && (
        <div className="text-sm text-muted-foreground">
          Start typing to search. Matches by first/last name or email; players
          are matched by name only.
        </div>
      )}

      {debounced.length > 0 && debounced.length < 2 && (
        <div className="text-sm text-muted-foreground">
          Keep going — at least 2 characters.
        </div>
      )}
    </div>
  )
}

function ResultsView({ data }: { data: LookupResponse }) {
  const total = data.users.length + data.people.length
  if (total === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground text-sm">
          No matches.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {data.users.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-ink uppercase tracking-wider mb-2">
            Accounts ({data.users.length})
          </h2>
          <div className="grid gap-2">
            {data.users.map((u) => (
              <UserRow key={u.id} user={u} />
            ))}
          </div>
        </section>
      )}

      {data.people.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-ink uppercase tracking-wider mb-2">
            Players ({data.people.length})
          </h2>
          <div className="grid gap-2">
            {data.people.map((p) => (
              <PersonRow key={p.id} person={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function UserRow({ user }: { user: UserResult }) {
  const displayName =
    user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.email
  return (
    <a
      href={`/admin/users/${user.id}`}
      className="block rounded border border-border bg-white p-3 hover:bg-cream transition-colors"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-gray-700 text-sm font-medium flex-shrink-0">
            {user.firstName?.[0] || user.email[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-ink truncate">{displayName}</div>
            <div className="text-xs text-ink-muted flex items-center gap-1 truncate">
              <Mail className="h-3 w-3 flex-shrink-0" />
              {user.email}
              {user.emailVerified && (
                <Badge variant="outline" className="ml-1 text-[10px] py-0">Verified</Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex gap-1 flex-wrap">
          {user.roles.length === 0 ? (
            <span className="text-xs text-ink-muted">No roles</span>
          ) : (
            user.roles.map((r) => (
              <Badge key={r} variant="outline" className="text-xs">
                <ShieldCheck className="h-3 w-3 mr-1" />
                {roleLabels[r] ?? r}
              </Badge>
            ))
          )}
        </div>
      </div>
    </a>
  )
}

function PersonRow({ person }: { person: PersonResult }) {
  const parentLink = person.parentUserId ?? person.selfUserId
  const href = parentLink ? `/admin/users/${parentLink}` : "#"
  const age = computeAge(person.birthDate)
  return (
    <a
      href={href}
      className="block rounded border border-border bg-white p-3 hover:bg-cream transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 flex-shrink-0">
          <UserRound className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-ink truncate">
            {person.firstName} {person.lastName}
          </div>
          <div className="text-xs text-ink-muted">
            {age != null ? `Age ${age}` : `DOB ${person.birthDate}`}
            {person.selfUserId ? " · Self" : person.parentUserId ? " · Dependent" : ""}
          </div>
        </div>
      </div>
    </a>
  )
}

function computeAge(birthDate: string): number | null {
  const dob = new Date(birthDate)
  if (Number.isNaN(dob.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - dob.getFullYear()
  const beforeBirthday =
    now.getMonth() < dob.getMonth() ||
    (now.getMonth() === dob.getMonth() && now.getDate() < dob.getDate())
  if (beforeBirthday) age -= 1
  return age >= 0 ? age : null
}
