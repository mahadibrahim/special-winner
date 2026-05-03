"use client"

import { useEffect, useState } from "react"
import { Loader2, Search, ShieldCheck, ShieldAlert, ShieldOff, Clock } from "lucide-react"
import { Input } from "@/components/ui/input"
import { ErrorBanner } from "@/components/ui/error-banner"
import { EmptyState } from "@/components/ui/empty-state"

type ConsentStatus =
  | { status: "missing" }
  | { status: "active"; signedAt: string; expiresAt: string | null; signedByName?: string }
  | { status: "expired"; signedAt: string; expiresAt: string }
  | { status: "revoked"; signedAt: string; revokedAt: string }

interface FamilyMemberCompliance {
  id: string
  firstName: string
  lastName: string
  birthDate: string
  kind: "self" | "dependent"
  consents: {
    parental: ConsentStatus | null
    ageConfirmation: ConsentStatus | null
    liability: ConsentStatus
    mediaInternal: ConsentStatus
    mediaPromotional: ConsentStatus
    mediaPublic: ConsentStatus
  }
}

export function ComplianceList() {
  const [items, setItems] = useState<FamilyMemberCompliance[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const params = new URLSearchParams()
    if (search.trim()) params.set("search", search.trim())
    fetch(`/api/admin/compliance/family-members?${params.toString()}`)
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error || "Failed to load")
        if (!cancelled) setItems(data.familyMembers)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [search])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Compliance</h1>
        <p className="text-sm text-ink-muted mt-1">
          Per-participant consent and waiver status. Use this to check who has
          signed waivers, who's opted into media use, and who needs follow-up
          before publishing photos or shipping rosters.
        </p>
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name…"
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title="No participants yet"
          description="Once families register for any program, they'll appear here with their consent statuses."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-cream-2 text-ink-muted">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Participant</th>
                <th className="text-left px-3 py-3 font-medium">Parental / Age</th>
                <th className="text-left px-3 py-3 font-medium">Liability</th>
                <th className="text-left px-3 py-3 font-medium">Internal</th>
                <th className="text-left px-3 py-3 font-medium">Promotional</th>
                <th className="text-left px-3 py-3 font-medium">Public</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.id} className="border-t border-border align-top">
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">
                      {m.firstName} {m.lastName}
                    </div>
                    <div className="text-xs text-ink-muted">
                      {m.kind === "self" ? "Adult self" : "Dependent"} · DOB {m.birthDate}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <Cell
                      status={
                        m.kind === "self"
                          ? m.consents.ageConfirmation ?? { status: "missing" }
                          : m.consents.parental ?? { status: "missing" }
                      }
                    />
                  </td>
                  <td className="px-3 py-3">
                    <Cell status={m.consents.liability} />
                  </td>
                  <td className="px-3 py-3">
                    <Cell status={m.consents.mediaInternal} />
                  </td>
                  <td className="px-3 py-3">
                    <Cell status={m.consents.mediaPromotional} />
                  </td>
                  <td className="px-3 py-3">
                    <Cell status={m.consents.mediaPublic} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function Cell({ status }: { status: ConsentStatus }) {
  if (status.status === "active") {
    return (
      <div className="inline-flex items-center gap-1.5 text-emerald-700">
        <ShieldCheck className="w-4 h-4" />
        <span className="text-xs">Active</span>
      </div>
    )
  }
  if (status.status === "expired") {
    return (
      <div className="inline-flex items-center gap-1.5 text-amber-700">
        <Clock className="w-4 h-4" />
        <span className="text-xs">Expired</span>
      </div>
    )
  }
  if (status.status === "revoked") {
    return (
      <div className="inline-flex items-center gap-1.5 text-rose-700">
        <ShieldOff className="w-4 h-4" />
        <span className="text-xs">Revoked</span>
      </div>
    )
  }
  return (
    <div className="inline-flex items-center gap-1.5 text-ink-faint">
      <ShieldAlert className="w-4 h-4" />
      <span className="text-xs">Missing</span>
    </div>
  )
}
