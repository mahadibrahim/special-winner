"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Search, ShieldCheck, ShieldAlert, ShieldOff, Clock, Ban } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { ErrorBanner } from "@/components/ui/error-banner"
import { EmptyState } from "@/components/ui/empty-state"

type ConsentStatus =
  | { status: "missing" }
  | { status: "active"; signedAt: string; expiresAt: string | null; signedByName?: string }
  | { status: "expired"; signedAt: string; expiresAt: string }
  | { status: "revoked"; signedAt: string; revokedAt: string }

type DoNotPublishStatus =
  | { active: true; reason: string | null }
  | { active: false }

interface FamilyMemberCompliance {
  id: string
  firstName: string
  lastName: string
  // Null for adult self-registrants whose DOB is still pending
  // post-payment review.
  birthDate: string | null
  kind: "self" | "dependent"
  consents: {
    parental: ConsentStatus | null
    ageConfirmation: ConsentStatus | null
    liability: ConsentStatus
    mediaInternal: ConsentStatus
    mediaPromotional: ConsentStatus
    mediaPublic: ConsentStatus
  }
  doNotPublish: DoNotPublishStatus
}

export function ComplianceList() {
  const [items, setItems] = useState<FamilyMemberCompliance[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

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

  /**
   * Per-individual media opt-out toggle (product-backlog build #3). A
   * simple set/clear against the Task 3 endpoint — not a workflow. Setting
   * prompts for an optional reason (the takedown/opt-out record); clearing
   * asks for confirmation since it removes the "do not feature" signal
   * photographers rely on. Optimistic update, rolled back with a toast on
   * failure — matches the ErrorBanner-for-page-state /
   * toast-for-transient-action split used elsewhere in this codebase.
   */
  async function toggleDoNotPublish(member: FamilyMemberCompliance) {
    const willActivate = !member.doNotPublish.active
    if (!willActivate) {
      const confirmed = window.confirm(
        `Clear the "do not publish" flag for ${member.firstName} ${member.lastName}? Their face-tagged media will be eligible to publish again.`,
      )
      if (!confirmed) return
    }
    const reason = willActivate
      ? window.prompt(
          `Reason for opting out ${member.firstName} ${member.lastName} from published media (optional):`,
        ) ?? undefined
      : undefined

    const previous = items
    setTogglingId(member.id)
    setItems((prev) =>
      prev.map((m) =>
        m.id === member.id
          ? {
              ...m,
              doNotPublish: willActivate
                ? { active: true, reason: reason?.trim() || null }
                : { active: false },
            }
          : m,
      ),
    )

    try {
      const res = await fetch(`/api/admin/compliance/family-members/${member.id}/do-not-publish`, {
        method: willActivate ? "PUT" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: willActivate ? JSON.stringify({ reason: reason?.trim() || undefined }) : undefined,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to update")
      setItems((prev) =>
        prev.map((m) => (m.id === member.id ? { ...m, doNotPublish: data.doNotPublish } : m)),
      )
      toast.success(
        willActivate
          ? `${member.firstName} ${member.lastName} opted out of published media`
          : `Cleared opt-out for ${member.firstName} ${member.lastName}`,
      )
    } catch (err) {
      setItems(previous)
      toast.error(err instanceof Error ? err.message : "Failed to update opt-out status")
    } finally {
      setTogglingId(null)
    }
  }

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
                <th className="text-left px-3 py-3 font-medium">Media opt-out</th>
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
                      {m.kind === "self" ? "Adult self" : "Dependent"} · DOB{" "}
                      {m.birthDate ?? "pending"}
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
                  <td className="px-3 py-3">
                    <div className="flex flex-col gap-1">
                      {m.doNotPublish.active ? (
                        <div className="inline-flex items-center gap-1.5 text-rose-700">
                          <Ban className="w-4 h-4" />
                          <span className="text-xs">Opted out</span>
                        </div>
                      ) : (
                        <span className="text-xs text-ink-faint">Publishable</span>
                      )}
                      {m.doNotPublish.active && m.doNotPublish.reason && (
                        <span className="text-xs text-ink-muted italic max-w-[16rem] truncate" title={m.doNotPublish.reason}>
                          {m.doNotPublish.reason}
                        </span>
                      )}
                      <Button
                        type="button"
                        variant={m.doNotPublish.active ? "outline" : "destructive"}
                        size="sm"
                        disabled={togglingId === m.id}
                        onClick={() => toggleDoNotPublish(m)}
                      >
                        {togglingId === m.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : m.doNotPublish.active ? (
                          "Clear opt-out"
                        ) : (
                          "Do not publish"
                        )}
                      </Button>
                    </div>
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
