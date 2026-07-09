"use client"

import { useState } from "react"
import { Plus, Trash2, Minus } from "lucide-react"
import { toast } from "sonner"
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Row = { side: "home" | "away"; player: string; minute: string; description: string }
type CardRow = Row & { type: "yellow_card" | "red_card" }
type EjRow = { side: "home" | "away"; player: string; minute: string; reason: string; gamesMissed: string }

export interface MatchCloseoutData {
  gameId: string
  homeTeamName: string | null
  awayTeamName: string | null
  homeScore: number | null
  awayScore: number | null
  refereeNotes: string | null
  completed: boolean
  cards: Array<{ type: string; side: string; player: string | null; minute: number | null; description: string | null }>
  injuries: Array<{ side: string; player: string | null; minute: number | null; description: string | null }>
  recordedEjections: Array<{ id: string; side: string; player: string | null; minute: number | null; reason: string | null }>
}

// A section is "answered" when it has rows OR None is chosen. null = not yet chosen.
type NoneChoice = boolean | null

export function MatchCloseout({ data }: { data: MatchCloseoutData }) {
  useHydrationBeacon()

  const [homeScore, setHomeScore] = useState(data.homeScore ?? 0)
  const [awayScore, setAwayScore] = useState(data.awayScore ?? 0)
  const [notes, setNotes] = useState(data.refereeNotes ?? "")

  const [cards, setCards] = useState<CardRow[]>(
    data.cards.map((c) => ({ type: c.type as "yellow_card" | "red_card", side: c.side as "home" | "away",
      player: c.player ?? "", minute: c.minute?.toString() ?? "", description: c.description ?? "" })))
  const [injuries, setInjuries] = useState<Row[]>(
    data.injuries.map((i) => ({ side: i.side as "home" | "away", player: i.player ?? "",
      minute: i.minute?.toString() ?? "", description: i.description ?? "" })))
  const [ejections, setEjections] = useState<EjRow[]>([])

  // Pre-answer None where the game is already completed and a section is empty.
  const [noCards, setNoCards] = useState<NoneChoice>(data.completed && data.cards.length === 0 ? true : data.cards.length ? false : null)
  const [noInjuries, setNoInjuries] = useState<NoneChoice>(data.completed && data.injuries.length === 0 ? true : data.injuries.length ? false : null)
  // Ejections section counts as answered if a recorded ejection already exists.
  const [noEjections, setNoEjections] = useState<NoneChoice>(data.recordedEjections.length ? false : (data.completed ? true : null))

  const [saving, setSaving] = useState(false)

  const teamLabel = (s: "home" | "away") => (s === "home" ? (data.homeTeamName ?? "Home") : (data.awayTeamName ?? "Away"))

  const cardsAnswered = cards.length > 0 || noCards === true
  const injuriesAnswered = injuries.length > 0 || noInjuries === true
  const ejectionsAnswered = ejections.length > 0 || data.recordedEjections.length > 0 || noEjections === true
  const canSubmit = cardsAnswered && injuriesAnswered && ejectionsAnswered && !saving

  async function submit() {
    setSaving(true)
    try {
      const res = await fetch(`/api/referee/matches/${data.gameId}/close-out`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          homeScore, awayScore,
          cards: cards.map((c) => ({ type: c.type, side: c.side, player: c.player || null,
            minute: c.minute === "" ? null : Number(c.minute), description: c.description || null })),
          injuries: injuries.map((i) => ({ side: i.side, player: i.player || null,
            minute: i.minute === "" ? null : Number(i.minute), description: i.description || null })),
          ejections: ejections.map((e) => ({ side: e.side, player: e.player, reason: e.reason,
            minute: e.minute === "" ? null : Number(e.minute), carriesSuspension: true,
            gamesMissed: e.gamesMissed === "" ? 1 : Number(e.gamesMissed), escalatedToDirector: false })),
          // The endpoint's None-gate requires, per section, exactly one of
          // (newEntries.length > 0) XOR (noX === true). The flag therefore
          // means "no NEW entries in THIS submission": empty → true, has new
          // entries → false. Recorded ejections persist server-side (the
          // replace step only deletes type <> 'ejection'), so we never resend
          // them and never flip noEjections false on their account.
          noCards: cards.length === 0,
          noInjuries: injuries.length === 0,
          noEjections: ejections.length === 0,
          refereeNotes: notes || null,
        }),
      })
      if (res.ok) { toast.success("Closed out. You're clear to be paid."); window.location.href = "/referee" }
      else { const b = await res.json().catch(() => ({})); toast.error(b.error ?? "Couldn't submit — try again.") }
    } catch { toast.error("Couldn't submit — try again.") } finally { setSaving(false) }
  }

  const Stepper = ({ value, set, label }: { value: number; set: (n: number) => void; label: string }) => (
    <div className="flex items-center gap-2">
      <Button type="button" variant="outline" size="icon" aria-label={`Decrease ${label}`} onClick={() => set(Math.max(0, value - 1))}><Minus className="h-4 w-4" /></Button>
      <span className="w-8 text-center text-2xl font-bold tabular-nums" aria-label={label}>{value}</span>
      <Button type="button" variant="outline" size="icon" aria-label={`Increase ${label}`} onClick={() => set(value + 1)}><Plus className="h-4 w-4" /></Button>
    </div>
  )

  return (
    <div className="space-y-6 max-w-2xl pb-24">
      <h1 className="text-2xl font-semibold">{data.homeTeamName ?? "TBD"} vs {data.awayTeamName ?? "TBD"}</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">Final score</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-center gap-6">
          <div className="text-center space-y-2"><div className="text-sm text-muted-foreground">{teamLabel("home")}</div><Stepper value={homeScore} set={setHomeScore} label="Home score" /></div>
          <span className="text-muted-foreground text-xl">–</span>
          <div className="text-center space-y-2"><div className="text-sm text-muted-foreground">{teamLabel("away")}</div><Stepper value={awayScore} set={setAwayScore} label="Away score" /></div>
        </CardContent>
      </Card>

      {/* Cards */}
      <SectionCard
        title="Cards" answered={cardsAnswered} noneChosen={noCards === true && cards.length === 0}
        onNone={() => { setCards([]); setNoCards(true) }}
        onLog={() => { setNoCards(false); setCards((xs) => xs.length ? xs : [{ type: "yellow_card", side: "home", player: "", minute: "", description: "" }]) }}
        showEditor={cards.length > 0 || noCards === false}
      >
        {cards.map((c, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 border-b pb-3 last:border-0">
            <select value={c.type} onChange={(e) => setCards((xs) => xs.map((x, j) => j === i ? { ...x, type: e.target.value as CardRow["type"] } : x))} className="rounded border px-2 py-1 text-sm">
              <option value="yellow_card">Yellow</option><option value="red_card">Red</option>
            </select>
            <select value={c.side} onChange={(e) => setCards((xs) => xs.map((x, j) => j === i ? { ...x, side: e.target.value as "home" | "away" } : x))} className="rounded border px-2 py-1 text-sm">
              <option value="home">{teamLabel("home")}</option><option value="away">{teamLabel("away")}</option>
            </select>
            <Input value={c.player} onChange={(e) => setCards((xs) => xs.map((x, j) => j === i ? { ...x, player: e.target.value } : x))} placeholder="Player / #" className="w-28" />
            <Input type="number" min="0" value={c.minute} onChange={(e) => setCards((xs) => xs.map((x, j) => j === i ? { ...x, minute: e.target.value } : x))} placeholder="min" className="w-16" />
            <Button type="button" variant="ghost" size="icon" aria-label="Remove card" onClick={() => setCards((xs) => xs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        {(cards.length > 0 || noCards === false) && (
          <Button type="button" variant="outline" size="sm" onClick={() => setCards((xs) => [...xs, { type: "yellow_card", side: "home", player: "", minute: "", description: "" }])}><Plus className="h-4 w-4 mr-1" />Add card</Button>
        )}
      </SectionCard>

      {/* Ejections */}
      <SectionCard
        title="Ejections" answered={ejectionsAnswered} noneChosen={noEjections === true && ejections.length === 0 && data.recordedEjections.length === 0}
        onNone={() => { setEjections([]); setNoEjections(true) }}
        onLog={() => { setNoEjections(false); setEjections((xs) => xs.length ? xs : [{ side: "home", player: "", minute: "", reason: "", gamesMissed: "1" }]) }}
        showEditor={ejections.length > 0 || noEjections === false || data.recordedEjections.length > 0}
      >
        {data.recordedEjections.map((e) => (
          <div key={e.id} className="text-sm text-muted-foreground border-b pb-2 last:border-0">
            Recorded: {e.player ?? "—"} · {e.side === "home" ? teamLabel("home") : teamLabel("away")}{e.minute != null ? ` · ${e.minute}'` : ""} · {e.reason ?? ""}
          </div>
        ))}
        {ejections.map((e, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 border-b pb-3 last:border-0">
            <select value={e.side} onChange={(ev) => setEjections((xs) => xs.map((x, j) => j === i ? { ...x, side: ev.target.value as "home" | "away" } : x))} className="rounded border px-2 py-1 text-sm">
              <option value="home">{teamLabel("home")}</option><option value="away">{teamLabel("away")}</option>
            </select>
            <Input value={e.player} onChange={(ev) => setEjections((xs) => xs.map((x, j) => j === i ? { ...x, player: ev.target.value } : x))} placeholder="Player / #" className="w-28" />
            <Input type="number" min="0" value={e.minute} onChange={(ev) => setEjections((xs) => xs.map((x, j) => j === i ? { ...x, minute: ev.target.value } : x))} placeholder="min" className="w-16" />
            <Input value={e.reason} onChange={(ev) => setEjections((xs) => xs.map((x, j) => j === i ? { ...x, reason: ev.target.value } : x))} placeholder="Reason" className="flex-1 min-w-32" />
            <Button type="button" variant="ghost" size="icon" aria-label="Remove ejection" onClick={() => setEjections((xs) => xs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        {(ejections.length > 0 || noEjections === false) && (
          <Button type="button" variant="outline" size="sm" onClick={() => setEjections((xs) => [...xs, { side: "home", player: "", minute: "", reason: "", gamesMissed: "1" }])}><Plus className="h-4 w-4 mr-1" />Add ejection</Button>
        )}
      </SectionCard>

      {/* Injuries */}
      <SectionCard
        title="Injuries" answered={injuriesAnswered} noneChosen={noInjuries === true && injuries.length === 0}
        onNone={() => { setInjuries([]); setNoInjuries(true) }}
        onLog={() => { setNoInjuries(false); setInjuries((xs) => xs.length ? xs : [{ side: "home", player: "", minute: "", description: "" }]) }}
        showEditor={injuries.length > 0 || noInjuries === false}
      >
        {injuries.map((inj, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 border-b pb-3 last:border-0">
            <select value={inj.side} onChange={(e) => setInjuries((xs) => xs.map((x, j) => j === i ? { ...x, side: e.target.value as "home" | "away" } : x))} className="rounded border px-2 py-1 text-sm">
              <option value="home">{teamLabel("home")}</option><option value="away">{teamLabel("away")}</option>
            </select>
            <Input value={inj.player} onChange={(e) => setInjuries((xs) => xs.map((x, j) => j === i ? { ...x, player: e.target.value } : x))} placeholder="Player / #" className="w-28" />
            <Input value={inj.description} onChange={(e) => setInjuries((xs) => xs.map((x, j) => j === i ? { ...x, description: e.target.value } : x))} placeholder="What happened" className="flex-1 min-w-32" />
            <Button type="button" variant="ghost" size="icon" aria-label="Remove injury" onClick={() => setInjuries((xs) => xs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        {(injuries.length > 0 || noInjuries === false) && (
          <Button type="button" variant="outline" size="sm" onClick={() => setInjuries((xs) => [...xs, { side: "home", player: "", minute: "", description: "" }])}><Plus className="h-4 w-4 mr-1" />Add injury</Button>
        )}
      </SectionCard>

      <Card>
        <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
        <CardContent>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full rounded border px-3 py-2 text-sm" placeholder="Anything notable about the match…" />
        </CardContent>
      </Card>

      <div className="fixed inset-x-0 bottom-0 border-t bg-background/95 p-4 backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <Button className="w-full" size="lg" disabled={!canSubmit} onClick={submit} data-testid="closeout-submit">
            {saving ? "Submitting…" : "Submit & check out"}
          </Button>
        </div>
      </div>
    </div>
  )
}

function SectionCard({ title, answered, noneChosen, onNone, onLog, showEditor, children }: {
  title: string; answered: boolean; noneChosen: boolean; onNone: () => void; onLog: () => void; showEditor: boolean; children: React.ReactNode
}) {
  return (
    <Card className={answered ? "" : "border-amber-400"}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">{title}</CardTitle>
        <div className="flex gap-2">
          <Button type="button" variant={noneChosen ? "default" : "outline"} size="sm" onClick={onNone}>None</Button>
          <Button type="button" variant={showEditor ? "default" : "outline"} size="sm" onClick={onLog}>Log</Button>
        </div>
      </CardHeader>
      {showEditor && <CardContent className="space-y-3">{children}</CardContent>}
    </Card>
  )
}
