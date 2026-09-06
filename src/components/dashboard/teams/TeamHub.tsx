"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Users,
  CalendarDays,
  Shirt,
  Copy,
  Check,
  Trophy,
  Plus,
  Trash2,
  Send,
  Bell,
  Pencil,
  MapPin,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ErrorBanner } from "@/components/ui/error-banner"
import { EmptyState } from "@/components/ui/empty-state"
import { cn } from "@/lib/utils"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"

// ---- Payload types (mirror buildTeamHubDetail in lib/registrations/team-hub) ----

interface HubMember {
  firstName: string
  lastInitial: string | null
  role: string
  registrationStatus: string
  paymentStatus: string
  waiverSigned: boolean
}
interface HubInvitee {
  id: string
  email: string
  assignedShareCents: number
  status: string
  invitedAt: string | null
  paidAt: string | null
}
interface ScheduleGame {
  id: string
  scheduledAt: string
  status: string
  isHome: boolean
  opponent: string
  venue: string | null
  teamScore: number | null
  opponentScore: number | null
}
interface StandingRow {
  teamId: string
  teamName: string
  played: number
  won: number
  drawn: number
  lost: number
  goalsFor: number
  goalsAgainst: number
  goalDiff: number
  points: number
}
interface HubDetail {
  team: {
    id: string
    teamName: string
    captainName: string
    captainEmail: string
    status: string
    createdAt: string | null
    inviteToken: string
    members: HubMember[]
    invitees: HubInvitee[]
  }
  payment: {
    teamFeeCents: number | null
    joinShareCents: number | null
    depositCents: number
    collectedCents: number
    paymentDeadline: string | null
    /** Server-computed (team-hub.ts) — never re-derived client-side. */
    isYouth: boolean
  }
  captainCredit: {
    shareCents: number
    creditCents: number
    dueCents: number
    depositCents: number
  } | null
  season: {
    id: string
    name: string
    slug: string
    startDate: string | null
    endDate: string | null
    maxParticipants: number | null
  }
  program: { id: string; name: string }
  sport: { id: string; name: string; slug: string }
  location: { id: string; name: string; slug: string }
  seasonModule: {
    rosterTeamId: string | null
    rosterTeamName: string | null
    schedule: ScheduleGame[]
    standings: StandingRow[]
    highlightTeamId: string | null
  }
}

type Tab = "team" | "season" | "kit"

function fmtCents(cents: number | null | undefined): string {
  if (cents == null) return "—"
  return `$${(cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`
}

function fmtDate(iso: string | null, opts?: Intl.DateTimeFormatOptions): string {
  if (!iso) return ""
  // A bare date-only string (season start/end, a `date` column) parses as UTC
  // midnight, which renders the PRIOR day in negative-offset zones (e.g. ET).
  // Build it as a local date so "Season starts Sep 1" doesn't show "Aug 31".
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso)
  return d.toLocaleDateString("en-US", opts ?? {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

const statusBadge: Record<string, { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-emerald-500/10 text-emerald-600" },
  charged_to_captain: {
    label: "Charged to you",
    className: "bg-amber-500/10 text-amber-600",
  },
  pending: { label: "Unpaid", className: "bg-cream-3 text-ink-muted" },
}

export default function TeamHub({ teamId }: { teamId: string }) {
  useHydrationBeacon()

  const [detail, setDetail] = useState<HubDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>("team")

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard/teams/${encodeURIComponent(teamId)}`)
      if (res.status === 404) {
        setLoadError("This team could not be found, or you don't manage it.")
        return
      }
      if (!res.ok) throw new Error("load failed")
      const json = (await res.json()) as HubDetail
      setDetail(json)
      setLoadError(null)
    } catch {
      setLoadError("We couldn't load your team. Please try again.")
    }
  }, [teamId])

  useEffect(() => {
    void load()
  }, [load])

  if (loadError) {
    return (
      <div className="max-w-2xl">
        <ErrorBanner message={loadError} />
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="flex items-center gap-2 text-ink-muted py-16">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading your team…
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-ink">{detail.team.teamName}</h1>
        <p className="text-sm text-ink-muted mt-1">
          {detail.season.name} · {detail.program.name} · {detail.location.name}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border">
        <TabButton icon={Users} label="Team" active={tab === "team"} onClick={() => setTab("team")} />
        <TabButton icon={CalendarDays} label="Season" active={tab === "season"} onClick={() => setTab("season")} />
        <TabButton icon={Shirt} label="Kit" soon />
      </div>

      {tab === "team" && <TeamTab detail={detail} reload={load} />}
      {tab === "season" && <SeasonTab detail={detail} />}
    </div>
  )
}

function TabButton({
  icon: Icon,
  label,
  active,
  soon,
  onClick,
}: {
  icon: typeof Users
  label: string
  active?: boolean
  soon?: boolean
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      disabled={soon}
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors",
        active
          ? "border-primary text-ink"
          : "border-transparent text-ink-muted hover:text-ink",
        soon && "cursor-default opacity-60 hover:text-ink-muted",
      )}
    >
      <Icon className="w-4 h-4" />
      {label}
      {soon && (
        <span className="text-[10px] uppercase tracking-wide text-ink-faint">soon</span>
      )}
    </button>
  )
}

// ============================ Team tab ============================

function TeamTab({ detail, reload }: { detail: HubDetail; reload: () => Promise<void> }) {
  const { team, payment, captainCredit, season } = detail
  const joinUrl = useMemo(
    () =>
      `${window.location.origin}/register/${season.id}?team=${encodeURIComponent(team.inviteToken)}`,
    [season.id, team.inviteToken],
  )

  const captainEmailLower = team.captainEmail.toLowerCase()
  const unpaidInvitees = team.invitees.filter(
    (i) => i.status === "pending" && i.email.toLowerCase() !== captainEmailLower,
  )

  return (
    <div className="space-y-6">
      <FeeProgress payment={payment} captainCredit={captainCredit} />

      <JoinLink
        joinUrl={joinUrl}
        inviteToken={team.inviteToken}
        joinShareCents={payment.joinShareCents}
        reload={reload}
      />

      <Roster
        team={team}
        unpaidCount={unpaidInvitees.length}
        reload={reload}
      />

      <AddTeammates
        inviteToken={team.inviteToken}
        teamFeeCents={payment.teamFeeCents}
        depositCents={payment.depositCents}
        isYouth={payment.isYouth}
        currentInviteeCount={team.invitees.length}
        reload={reload}
      />
    </div>
  )
}

function FeeProgress({
  payment,
  captainCredit,
}: {
  payment: HubDetail["payment"]
  captainCredit: HubDetail["captainCredit"]
}) {
  const { teamFeeCents, collectedCents, paymentDeadline } = payment
  const pct =
    teamFeeCents && teamFeeCents > 0
      ? Math.min(100, Math.round((collectedCents / teamFeeCents) * 100))
      : 0
  const remaining = teamFeeCents ? Math.max(0, teamFeeCents - collectedCents) : null

  return (
    <div className="p-5 rounded-2xl bg-paper border border-border">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-sm text-ink-muted">Team fee collected</span>
        <span className="text-lg font-semibold text-ink">
          {fmtCents(collectedCents)}
          {teamFeeCents != null && (
            <span className="text-sm text-ink-muted font-normal"> / {fmtCents(teamFeeCents)}</span>
          )}
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-cream-3 overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2 text-xs text-ink-muted">
        {remaining == null ? (
          <span>{fmtCents(collectedCents)} collected</span>
        ) : remaining > 0 ? (
          <span>{fmtCents(remaining)} still to collect</span>
        ) : (
          <span className="text-emerald-600">Fully collected 🎉</span>
        )}
        {paymentDeadline && (
          <span>
            Unpaid shares charged to your card {fmtDate(paymentDeadline)}
          </span>
        )}
      </div>
      {captainCredit && captainCredit.dueCents > 0 && (
        <p className="text-xs text-ink-muted mt-3 pt-3 border-t border-border">
          Your own player registration: {fmtCents(captainCredit.dueCents)} due after your{" "}
          {fmtCents(captainCredit.depositCents)} deposit credit.
        </p>
      )}
    </div>
  )
}

function JoinLink({
  joinUrl,
  inviteToken,
  joinShareCents,
  reload,
}: {
  joinUrl: string
  inviteToken: string
  joinShareCents: number | null
  reload: () => Promise<void>
}) {
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [priceInput, setPriceInput] = useState(
    joinShareCents != null ? (joinShareCents / 100).toFixed(2) : "",
  )
  const [saving, setSaving] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Couldn't copy — select and copy the link manually.")
    }
  }

  const savePrice = async (cents: number | null) => {
    setSaving(true)
    try {
      const res = await fetch(
        `/api/public/team-registrations/${encodeURIComponent(inviteToken)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ joinShareCents: cents }),
        },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Could not update the join price")
      toast.success(
        cents != null
          ? `Joiners now pay ${fmtCents(cents)}.`
          : "Joiners now pay the standard individual price.",
      )
      setEditing(false)
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update the join price")
    } finally {
      setSaving(false)
    }
  }

  const submitPrice = () => {
    const dollars = parseFloat(priceInput)
    if (Number.isNaN(dollars) || dollars < 0) {
      toast.error("Enter a price of $0.00 or more.")
      return
    }
    void savePrice(Math.round(dollars * 100))
  }

  return (
    <div className="p-4 rounded-2xl bg-paper border border-border">
      <p className="text-sm font-medium text-ink mb-2">Team join link</p>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={joinUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-cream border border-border text-sm text-ink-2"
        />
        <Button variant="outline" onClick={copy} className="border-border shrink-0">
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          <span className="ml-2 hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
        </Button>
      </div>
      <p className="text-xs text-ink-muted mt-2">
        Anyone who opens this link registers and pays their share, then joins your
        roster. Every payment counts toward your team fee.
      </p>

      <div className="mt-3 pt-3 border-t border-border">
        {!editing ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-ink-muted">
              Joiners pay:{" "}
              <span className="font-medium text-ink">
                {joinShareCents != null
                  ? fmtCents(joinShareCents)
                  : "standard individual price"}
              </span>
              {/* A teammate you invited with a specific share always pays that share. */}
            </p>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs font-medium text-primary hover:underline shrink-0"
            >
              Set price
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink-muted">Joiners pay $</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              className="w-24 px-2 py-1.5 rounded-lg bg-cream border border-border text-sm text-ink-2"
            />
            <Button size="sm" onClick={submitPrice} disabled={saving}>
              Save
            </Button>
            {joinShareCents != null && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => void savePrice(null)}
                disabled={saving}
                className="border-border"
              >
                Use standard price
              </Button>
            )}
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-xs text-ink-muted hover:underline"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Roster({
  team,
  unpaidCount,
  reload,
}: {
  team: HubDetail["team"]
  unpaidCount: number
  reload: () => Promise<void>
}) {
  const [reminding, setReminding] = useState(false)

  const remindAll = async () => {
    setReminding(true)
    try {
      const res = await fetch(
        `/api/public/team-registrations/${encodeURIComponent(team.inviteToken)}/remind`,
        { method: "POST" },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Could not send reminders")
      // Key the message off `unpaid` (who was reminded), not `sent` (successful
      // deliveries) — otherwise a send failure reads as "nobody to remind".
      toast.success(
        json.unpaid > 0
          ? `Reminder sent to ${json.unpaid} unpaid teammate${json.unpaid === 1 ? "" : "s"}.`
          : "No unpaid teammates to remind.",
      )
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send reminders")
    } finally {
      setReminding(false)
    }
  }

  const captainEmailLower = team.captainEmail.toLowerCase()

  return (
    <div className="rounded-2xl bg-paper border border-border overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h2 className="font-semibold text-ink flex items-center gap-2">
          <Users className="w-4 h-4 text-ink-muted" />
          Roster
        </h2>
        {unpaidCount > 0 && (
          <Button variant="outline" size="sm" onClick={remindAll} disabled={reminding} className="border-border">
            {reminding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
            <span className="ml-2">Remind unpaid ({unpaidCount})</span>
          </Button>
        )}
      </div>

      <ul className="divide-y divide-border">
        {/* Confirmed players (captain first). */}
        {[...team.members]
          .sort((a, b) => (a.role === "captain" ? -1 : b.role === "captain" ? 1 : 0))
          .map((m, idx) => (
            <li key={`m-${idx}`} className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-cream-3 flex items-center justify-center text-xs font-semibold text-ink-muted">
                  {m.firstName[0]}
                </div>
                <div>
                  <p className="text-sm font-medium text-ink">
                    {m.firstName} {m.lastInitial ? `${m.lastInitial}.` : ""}
                    {m.role === "captain" && (
                      <Badge className="ml-2 bg-primary/10 text-primary border-0 text-[10px]">
                        Captain
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {m.waiverSigned ? "Waiver signed" : "Waiver pending"}
                  </p>
                </div>
              </div>
              <Badge className="bg-emerald-500/10 text-emerald-600 border-0 text-[10px]">
                On roster
              </Badge>
            </li>
          ))}

        {/* Invitees (pending / paid). Never show the captain's own invitee row. */}
        {team.invitees
          .filter((i) => i.email.toLowerCase() !== captainEmailLower)
          .map((inv) => (
            <InviteeRow key={inv.id} invitee={inv} inviteToken={team.inviteToken} reload={reload} />
          ))}

        {team.members.length === 0 && team.invitees.length === 0 && (
          <li className="p-6 text-center text-sm text-ink-muted">
            No teammates yet — add them below or share your join link.
          </li>
        )}
      </ul>
    </div>
  )
}

function InviteeRow({
  invitee,
  inviteToken,
  reload,
}: {
  invitee: HubInvitee
  inviteToken: string
  reload: () => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [amount, setAmount] = useState((invitee.assignedShareCents / 100).toString())
  const [busy, setBusy] = useState(false)
  const badge = statusBadge[invitee.status] ?? statusBadge.pending

  const saveShare = async () => {
    const shareCents = Math.round(parseFloat(amount || "0") * 100)
    if (!Number.isFinite(shareCents) || shareCents < 0) {
      toast.error("Enter a valid share amount.")
      return
    }
    setBusy(true)
    try {
      const res = await fetch(
        `/api/public/team-registrations/${encodeURIComponent(inviteToken)}/invite`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invites: [{ email: invitee.email, shareCents }] }),
        },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Could not update share")
      toast.success("Share updated and re-sent.")
      setEditing(false)
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update share")
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    try {
      const res = await fetch(
        `/api/public/team-registrations/${encodeURIComponent(inviteToken)}/invitee`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ inviteeId: invitee.id }),
        },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Could not remove")
      toast.success(`Removed ${invitee.email}.`)
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove")
    } finally {
      setBusy(false)
    }
  }

  const isPending = invitee.status === "pending"

  return (
    <li className="flex items-center justify-between p-4 gap-3">
      <div className="min-w-0">
        <p className="text-sm text-ink truncate">{invitee.email}</p>
        {editing ? (
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-ink-muted">$</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-24 px-2 py-1 rounded-lg bg-cream border border-border text-sm text-ink"
            />
            <Button size="sm" onClick={saveShare} disabled={busy}>
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
            </Button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="text-xs text-ink-muted hover:text-ink"
            >
              Cancel
            </button>
          </div>
        ) : (
          <p className="text-xs text-ink-muted">
            Share {fmtCents(invitee.assignedShareCents)} · invited {fmtDate(invitee.invitedAt)}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Badge className={cn("border-0 text-[10px]", badge.className)}>{badge.label}</Badge>
        {isPending && !editing && (
          <>
            <button
              type="button"
              title="Edit share"
              onClick={() => setEditing(true)}
              disabled={busy}
              className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-cream-3 transition-colors"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              type="button"
              title="Remove teammate"
              onClick={remove}
              disabled={busy}
              className="p-1.5 rounded-lg text-ink-muted hover:text-red-600 hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </li>
  )
}

function AddTeammates({
  inviteToken,
  teamFeeCents,
  depositCents,
  isYouth,
  currentInviteeCount,
  reload,
}: {
  inviteToken: string
  teamFeeCents: number | null
  depositCents: number
  /** Server-computed (team-hub.ts's isYouthTeamSeason) — a youth roster
   *  covers the FULL team fee (the deposit is a refundable hold, never a
   *  per-share credit); adult covers fee-minus-deposit, unchanged. These
   *  shares are persisted verbatim by the invite endpoint, so getting this
   *  wrong here directly caps what the roster is ever asked to pay
   *  (winter-team-fixes, fix round 1 — CRITICAL 1). */
  isYouth: boolean
  currentInviteeCount: number
  reload: () => Promise<void>
}) {
  // Default share = even split of the splittable amount across a nominal
  // roster — the full team fee for youth, (teamFee − deposit) for adult.
  const defaultShare = useMemo(() => {
    const splittable = isYouth
      ? Math.max(0, teamFeeCents ?? 0)
      : Math.max(0, (teamFeeCents ?? 0) - depositCents)
    const denom = Math.max(1, currentInviteeCount + 1)
    return splittable > 0 ? (Math.round(splittable / denom) / 100).toFixed(2) : ""
  }, [teamFeeCents, depositCents, isYouth, currentInviteeCount])

  const [rows, setRows] = useState<{ email: string; amount: string }[]>([
    { email: "", amount: defaultShare },
  ])
  const [busy, setBusy] = useState(false)

  const update = (idx: number, patch: Partial<{ email: string; amount: string }>) =>
    setRows((rs) => rs.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  const addRow = () => setRows((rs) => [...rs, { email: "", amount: defaultShare }])
  const removeRow = (idx: number) => setRows((rs) => rs.filter((_, i) => i !== idx))

  const send = async () => {
    const invites = rows
      .filter((r) => r.email.trim())
      .map((r) => ({
        email: r.email.trim().toLowerCase(),
        shareCents: Math.round(parseFloat(r.amount || "0") * 100),
      }))
    if (invites.length === 0) {
      toast.error("Add at least one teammate email.")
      return
    }
    if (invites.some((i) => !Number.isFinite(i.shareCents) || i.shareCents < 0)) {
      toast.error("Enter a valid share for each teammate.")
      return
    }
    setBusy(true)
    try {
      const res = await fetch(
        `/api/public/team-registrations/${encodeURIComponent(inviteToken)}/invite`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invites }),
        },
      )
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Could not send invites")
      toast.success(`Invited ${invites.length} teammate${invites.length === 1 ? "" : "s"}.`)
      setRows([{ email: "", amount: defaultShare }])
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send invites")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-4 rounded-2xl bg-paper border border-border">
      <h2 className="font-semibold text-ink flex items-center gap-2 mb-1">
        <Plus className="w-4 h-4 text-ink-muted" />
        Add teammates
      </h2>
      <p className="text-xs text-ink-muted mb-3">
        Each teammate gets an invite email with their share and a personal join link.
      </p>
      <div className="space-y-2">
        {rows.map((row, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <input
              type="email"
              placeholder="teammate@email.com"
              value={row.email}
              onChange={(e) => update(idx, { email: e.target.value })}
              className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-cream border border-border text-sm text-ink"
            />
            <div className="flex items-center gap-1">
              <span className="text-xs text-ink-muted">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={row.amount}
                onChange={(e) => update(idx, { amount: e.target.value })}
                className="w-20 px-2 py-2 rounded-xl bg-cream border border-border text-sm text-ink"
              />
            </div>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => removeRow(idx)}
                className="p-1.5 rounded-lg text-ink-muted hover:text-red-600"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-3">
        <Button variant="outline" size="sm" onClick={addRow} className="border-border">
          <Plus className="w-4 h-4" />
          <span className="ml-1">Add row</span>
        </Button>
        <Button size="sm" onClick={send} disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          <span className="ml-2">Send invites</span>
        </Button>
      </div>
    </div>
  )
}

// ============================ Season tab ============================

function SeasonTab({ detail }: { detail: HubDetail }) {
  const { seasonModule, season } = detail

  if (!seasonModule.rosterTeamId) {
    return (
      <EmptyState
        title="Schedule & standings coming soon"
        description={
          season.startDate
            ? `Your games and standings appear here once the season is set. Season starts ${fmtDate(
                season.startDate,
              )}.`
            : "Your games and standings appear here once the season schedule is set."
        }
        icon={<CalendarDays className="w-8 h-8" />}
      />
    )
  }

  return (
    <div className="space-y-6">
      <Schedule games={seasonModule.schedule} />
      <Standings
        rows={seasonModule.standings}
        highlightTeamId={seasonModule.highlightTeamId}
        allowDraws={detail.sport.slug === "soccer"}
      />
    </div>
  )
}

function Schedule({ games }: { games: ScheduleGame[] }) {
  if (games.length === 0) {
    return (
      <div className="rounded-2xl bg-paper border border-border p-6 text-center text-sm text-ink-muted">
        No games scheduled yet.
      </div>
    )
  }
  return (
    <div className="rounded-2xl bg-paper border border-border overflow-hidden">
      <h2 className="font-semibold text-ink flex items-center gap-2 p-4 border-b border-border">
        <CalendarDays className="w-4 h-4 text-ink-muted" />
        Schedule
      </h2>
      <ul className="divide-y divide-border">
        {games.map((g) => {
          const played = g.status === "completed" && g.teamScore != null && g.opponentScore != null
          const won = played && (g.teamScore ?? 0) > (g.opponentScore ?? 0)
          const lost = played && (g.teamScore ?? 0) < (g.opponentScore ?? 0)
          return (
            <li key={g.id} className="flex items-center justify-between p-4 gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink truncate">
                  <span className="text-ink-muted">{g.isHome ? "vs" : "@"}</span> {g.opponent}
                </p>
                <p className="text-xs text-ink-muted flex items-center gap-2 mt-0.5">
                  <span>{fmtDate(g.scheduledAt, { weekday: "short", month: "short", day: "numeric" })}</span>
                  <span>
                    {new Date(g.scheduledAt).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                  {g.venue && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {g.venue}
                    </span>
                  )}
                </p>
              </div>
              {played ? (
                <div className="text-right shrink-0">
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      won && "text-emerald-600",
                      lost && "text-red-600",
                      !won && !lost && "text-ink-muted",
                    )}
                  >
                    {won ? "W" : lost ? "L" : "D"} {g.teamScore}–{g.opponentScore}
                  </span>
                </div>
              ) : (
                <Badge className="bg-cream-3 text-ink-muted border-0 text-[10px] shrink-0">
                  {g.status === "cancelled" || g.status === "postponed" ? g.status : "Upcoming"}
                </Badge>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Standings({
  rows,
  highlightTeamId,
  allowDraws,
}: {
  rows: StandingRow[]
  highlightTeamId: string | null
  allowDraws: boolean
}) {
  if (rows.length === 0) return null
  return (
    <div className="rounded-2xl bg-paper border border-border overflow-hidden">
      <h2 className="font-semibold text-ink flex items-center gap-2 p-4 border-b border-border">
        <Trophy className="w-4 h-4 text-ink-muted" />
        Standings
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-ink-muted border-b border-border">
              <th className="text-left font-medium px-4 py-2">Team</th>
              <th className="text-center font-medium px-2 py-2">P</th>
              <th className="text-center font-medium px-2 py-2">W</th>
              {allowDraws && <th className="text-center font-medium px-2 py-2">D</th>}
              <th className="text-center font-medium px-2 py-2">L</th>
              <th className="text-center font-medium px-2 py-2">GD</th>
              <th className="text-center font-medium px-3 py-2">Pts</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const mine = r.teamId === highlightTeamId
              return (
                <tr
                  key={r.teamId}
                  className={cn(
                    "border-b border-border last:border-0",
                    mine && "bg-primary/5",
                  )}
                >
                  <td className="px-4 py-2.5">
                    <span className="text-ink-faint mr-2">{i + 1}</span>
                    <span className={cn("text-ink", mine && "font-semibold")}>{r.teamName}</span>
                  </td>
                  <td className="text-center px-2 py-2.5 text-ink-muted">{r.played}</td>
                  <td className="text-center px-2 py-2.5 text-ink-muted">{r.won}</td>
                  {allowDraws && (
                    <td className="text-center px-2 py-2.5 text-ink-muted">{r.drawn}</td>
                  )}
                  <td className="text-center px-2 py-2.5 text-ink-muted">{r.lost}</td>
                  <td className="text-center px-2 py-2.5 text-ink-muted">
                    {r.goalDiff > 0 ? `+${r.goalDiff}` : r.goalDiff}
                  </td>
                  <td className="text-center px-3 py-2.5 font-semibold text-ink">{r.points}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
