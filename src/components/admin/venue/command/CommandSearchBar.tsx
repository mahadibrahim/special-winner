"use client"

import { useEffect, useRef, useState } from "react"
import { Search, Loader2, UserRound } from "lucide-react"
import { toast } from "sonner"
import { ErrorBanner } from "@/components/ui/error-banner"
import type { PersonCardTarget } from "@/components/admin/person/PersonCard"

// ─── Result types (from /api/admin/lookup) ────────────────────────────────────

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
  // Null for adult self-registrants whose DOB is still pending
  // post-payment review.
  birthDate: string | null
  parentUserId: string | null
  selfUserId: string | null
}

type LookupResponse = {
  users: UserResult[]
  people: PersonResult[]
  note?: string
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  onOpenPerson: (target: PersonCardTarget) => void
  onWalkIn: () => void
  onFindBooking: () => void
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function computeAge(birthDate: string | null): number | null {
  if (!birthDate) return null
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

function initials(firstName: string | null, lastName: string | null, fallback: string): string {
  const f = firstName?.[0] ?? ""
  const l = lastName?.[0] ?? ""
  return (f + l).toUpperCase() || fallback[0].toUpperCase()
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CommandSearchBar({ onOpenPerson, onWalkIn, onFindBooking }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const [q, setQ] = useState("")
  const [debounced, setDebounced] = useState("")
  const [data, setData] = useState<LookupResponse | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  // ── ⌘K / Ctrl+K global shortcut ───────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [])

  // ── Close dropdown on outside click ───────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  // ── Debounce input (250 ms) ────────────────────────────────────────────────
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250)
    return () => clearTimeout(t)
  }, [q])

  // ── Fetch from /api/admin/lookup ───────────────────────────────────────────
  useEffect(() => {
    let alive = true
    if (debounced.length < 2) {
      setData(null)
      setIsLoading(false)
      setError(null)
      setOpen(false)
      return
    }
    setIsLoading(true)
    setError(null)
    setOpen(true)
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
        console.error("[CommandSearchBar] fetch failed:", err)
        setError("Search failed — please try again.")
        // Also toast: the dropdown (and its inline error) closes on blur, so
        // without this the failure would vanish without the desk ever seeing it.
        toast.error("Search failed — try again")
      })
      .finally(() => {
        if (alive) setIsLoading(false)
      })
    return () => {
      alive = false
    }
  }, [debounced])

  const handleSelect = (target: PersonCardTarget) => {
    onOpenPerson(target)
    setOpen(false)
    setQ("")
  }

  const hasResults = data && (data.people.length > 0 || data.users.length > 0)
  const showDropdown = open && debounced.length >= 2

  return (
    <div
      className="flex items-center gap-3 px-[22px] py-[14px] border-b border-[#e4ddcf] bg-[#fffdf8] sticky top-0 z-10"
    >
      {/* ── Search input ────────────────────────────────────────────────────── */}
      <div className="relative flex-1 max-w-[560px]" ref={containerRef}>
        <Search className="absolute left-[11px] top-1/2 -translate-y-1/2 h-4 w-4 text-[#8a8175] pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => {
            setQ(e.target.value)
            if (e.target.value.trim().length >= 2) setOpen(true)
          }}
          onFocus={() => {
            if (debounced.length >= 2) setOpen(true)
          }}
          placeholder="Search players and accounts…"
          className="w-full border border-[#e4ddcf] rounded-[10px] py-[10px] pl-9 pr-[52px] text-sm bg-[#f6f1e7] text-[#1c1a17] placeholder:text-[#8a8175] focus:outline-none focus:ring-2 focus:ring-[#1c1a17]/20"
          aria-label="Search players and accounts"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={showDropdown}
        />
        {/* ⌘K badge */}
        <span className="absolute right-[10px] top-1/2 -translate-y-1/2 text-[11px] text-[#8a8175] border border-[#e4ddcf] rounded-[5px] px-[6px] py-[1px] bg-[#fffdf8] pointer-events-none select-none">
          ⌘K
        </span>

        {/* ── Dropdown results ────────────────────────────────────────────── */}
        {showDropdown && (
          <div
            className="absolute top-[calc(100%+6px)] left-0 right-0 bg-[#fffdf8] border border-[#e4ddcf] rounded-[12px] shadow-[0_14px_40px_rgba(0,0,0,0.14)] overflow-hidden z-[50]"
            role="listbox"
            aria-label="Search results"
          >
            {isLoading && (
              <div className="flex items-center gap-2 px-3 py-3 text-sm text-[#8a8175]">
                <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                Searching…
              </div>
            )}

            {error && !isLoading && (
              <div className="px-3 py-3">
                <ErrorBanner message={error} />
              </div>
            )}

            {!isLoading && !error && data && !hasResults && (
              <div className="px-3 py-4 text-sm text-center text-[#8a8175]">No matches.</div>
            )}

            {!isLoading && !error && hasResults && (
              <>
                {/* Players group */}
                {data.people.length > 0 && (
                  <div>
                    <div className="text-[10.5px] tracking-[0.12em] uppercase font-[800] text-[#8a8175] px-[13px] pt-2 pb-1">
                      Players
                    </div>
                    {data.people.map((person) => {
                      const age = computeAge(person.birthDate)
                      const parentOrSelf = person.parentUserId ?? person.selfUserId
                      return (
                        <button
                          key={person.id}
                          role="option"
                          data-person-result
                          aria-selected="false"
                          onClick={() => handleSelect({ id: person.id, as: "family_member" })}
                          className="w-full flex items-center gap-[10px] px-[13px] py-2 hover:bg-[#f6f1e7] focus:bg-[#f6f1e7] focus:outline-none cursor-pointer text-left"
                        >
                          <div className="w-[30px] h-[30px] rounded-full bg-[#e7f1ea] text-[#2f7d4f] flex items-center justify-center font-bold text-xs flex-shrink-0">
                            <UserRound className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-[14px] font-semibold text-[#1c1a17] truncate">
                              {person.firstName} {person.lastName}
                            </div>
                            <div className="text-[12px] text-[#8a8175] truncate">
                              {age != null
                                ? `Age ${age}`
                                : person.birthDate
                                  ? `DOB ${person.birthDate}`
                                  : "DOB pending"}
                              {person.selfUserId
                                ? " · self"
                                : person.parentUserId
                                  ? " · dependent"
                                  : ""}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}

                {/* Parents / accounts group */}
                {data.users.length > 0 && (
                  <div className={data.people.length > 0 ? "border-t border-[#efe9dc]" : ""}>
                    <div className="text-[10.5px] tracking-[0.12em] uppercase font-[800] text-[#8a8175] px-[13px] pt-2 pb-1">
                      Parents / accounts
                    </div>
                    {data.users.map((user) => {
                      const displayName =
                        user.firstName && user.lastName
                          ? `${user.firstName} ${user.lastName}`
                          : user.email
                      return (
                        <button
                          key={user.id}
                          role="option"
                          data-person-result
                          aria-selected="false"
                          onClick={() => handleSelect({ id: user.id, as: "user" })}
                          className="w-full flex items-center gap-[10px] px-[13px] py-2 hover:bg-[#f6f1e7] focus:bg-[#f6f1e7] focus:outline-none cursor-pointer text-left"
                        >
                          <div className="w-[30px] h-[30px] rounded-full bg-[#eef0e9] text-[#4b463e] flex items-center justify-center font-bold text-xs flex-shrink-0 select-none">
                            {initials(user.firstName, user.lastName, user.email)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[14px] font-semibold text-[#1c1a17] truncate">
                              {displayName}
                            </div>
                            <div className="text-[12px] text-[#8a8175] truncate">
                              {user.email}
                              {user.roles.length > 0 ? ` · ${user.roles[0]}` : ""}
                            </div>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── Action buttons ──────────────────────────────────────────────────── */}
      <button
        onClick={onWalkIn}
        className="border border-[#1c1a17] bg-[#1c1a17] text-[#f6f1e7] rounded-[9px] px-[13px] py-[9px] text-[13px] font-bold cursor-pointer whitespace-nowrap hover:bg-[#2e2b26] transition-colors"
      >
        + Walk-in
      </button>
      <button
        onClick={onFindBooking}
        className="border border-[#e4ddcf] bg-[#f6f1e7] text-[#1c1a17] rounded-[9px] px-[13px] py-[9px] text-[13px] font-bold cursor-pointer whitespace-nowrap hover:bg-[#ede7d9] transition-colors"
      >
        Find booking
      </button>
    </div>
  )
}
