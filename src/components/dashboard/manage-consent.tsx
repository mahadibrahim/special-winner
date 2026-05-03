"use client"

import { useEffect, useState } from "react"
import { Loader2, ShieldCheck, ShieldOff, Clock, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ErrorBanner } from "@/components/ui/error-banner"
import { toast } from "sonner"

interface ConsentRow {
  id: string
  type: "parental" | "age_confirmation" | "liability" | "media_authorization"
  scope: "internal" | "promotional" | "public" | null
  status: "granted" | "revoked"
  signedAt: string
  expiresAt: string | null
  signedByName: string
}

interface FamilyMember {
  id: string
  firstName: string
  lastName: string
  kind: "self" | "dependent"
}

const TYPE_LABEL: Record<ConsentRow["type"], string> = {
  parental: "Parental consent",
  age_confirmation: "Age confirmation (18+)",
  liability: "Liability waiver",
  media_authorization: "Media authorization",
}

const SCOPE_LABEL: Record<NonNullable<ConsentRow["scope"]>, string> = {
  internal: "Internal use",
  promotional: "Promotional materials",
  public: "Public / press",
}

const SCOPE_DESC: Record<NonNullable<ConsentRow["scope"]>, string> = {
  internal: "Team rosters, parent-only galleries, end-of-season recaps.",
  promotional: "Aspire Sports website, brochures, social media.",
  public: "Press releases, partner organizations, public materials.",
}

export function ManageConsent({ familyMemberId }: { familyMemberId: string }) {
  const [member, setMember] = useState<FamilyMember | null>(null)
  const [rows, setRows] = useState<ConsentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [revokingId, setRevokingId] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const r = await fetch(`/api/consents/family-members/${familyMemberId}`)
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || "Failed to load")
      setMember(data.familyMember)
      setRows(data.consents)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [familyMemberId])

  async function handleRevoke(consent: ConsentRow) {
    if (consent.type !== "media_authorization") return
    if (
      !confirm(
        `Withdraw consent for ${SCOPE_LABEL[consent.scope!]}? Already-published photos won't be removed automatically — contact support for takedowns.`,
      )
    ) {
      return
    }
    setRevokingId(consent.id)
    try {
      const r = await fetch(`/api/consents/${consent.id}/revoke`, {
        method: "POST",
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || "Failed to revoke")
      toast.success("Consent withdrawn.")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke")
    } finally {
      setRevokingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  if (error || !member) {
    return <ErrorBanner message={error ?? "Unable to load"} />
  }

  // Group by type for cleaner display.
  const mediaRows = rows.filter((r) => r.type === "media_authorization")
  const otherRows = rows.filter((r) => r.type !== "media_authorization")

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink">
          Manage consent — {member.firstName} {member.lastName}
        </h1>
        <p className="text-sm text-ink-muted mt-1">
          Review and update what Aspire Sports may use of{" "}
          {member.kind === "self" ? "your" : `${member.firstName}'s`} likeness.
          To remove a previously published photo, email{" "}
          <a href="mailto:hello@aspiresportsohio.com" className="underline">
            hello@aspiresportsohio.com
          </a>
          .
        </p>
      </div>

      <section>
        <h2 className="text-lg font-medium text-ink mb-3">Media authorization</h2>
        <div className="space-y-3">
          {(["internal", "promotional", "public"] as const).map((scope) => {
            const r = mediaRows.find((m) => m.scope === scope) ?? null
            const isActive = r?.status === "granted"
            return (
              <div
                key={scope}
                className="p-4 rounded-xl border border-border bg-cream-2 flex items-start gap-3"
              >
                <div className="mt-1">
                  {isActive ? (
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <ShieldOff className="w-5 h-5 text-ink-faint" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="font-medium text-ink">{SCOPE_LABEL[scope]}</div>
                  <div className="text-xs text-ink-muted mt-1">
                    {SCOPE_DESC[scope]}
                  </div>
                  {r && (
                    <div className="text-xs text-ink-faint mt-2">
                      {isActive
                        ? `Granted ${new Date(r.signedAt).toLocaleDateString()} by ${r.signedByName}`
                        : `Withdrawn ${new Date(r.signedAt).toLocaleDateString()}`}
                    </div>
                  )}
                </div>
                {isActive && r && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRevoke(r)}
                    disabled={revokingId === r.id}
                  >
                    {revokingId === r.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      "Withdraw"
                    )}
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {otherRows.length > 0 && (
        <section>
          <h2 className="text-lg font-medium text-ink mb-3">Other consents</h2>
          <div className="space-y-3">
            {otherRows.map((r) => {
              const isExpired =
                r.expiresAt && new Date(r.expiresAt).getTime() <= Date.now()
              return (
                <div
                  key={r.id}
                  className="p-4 rounded-xl border border-border bg-cream-2 flex items-start gap-3"
                >
                  <div className="mt-1">
                    {r.status === "granted" && !isExpired ? (
                      <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    ) : isExpired ? (
                      <Clock className="w-5 h-5 text-amber-600" />
                    ) : (
                      <ShieldAlert className="w-5 h-5 text-ink-faint" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-ink">{TYPE_LABEL[r.type]}</div>
                    <div className="text-xs text-ink-muted mt-1">
                      Signed {new Date(r.signedAt).toLocaleDateString()} by{" "}
                      {r.signedByName}
                    </div>
                    {r.expiresAt && (
                      <div className="text-xs text-ink-faint mt-1">
                        {isExpired
                          ? `Expired ${new Date(r.expiresAt).toLocaleDateString()} — re-signed at next registration`
                          : `Valid through ${new Date(r.expiresAt).toLocaleDateString()}`}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-xs text-ink-faint mt-3">
            Liability waivers and parental consent cannot be revoked online —
            email support to request a change.
          </p>
        </section>
      )}
    </div>
  )
}
