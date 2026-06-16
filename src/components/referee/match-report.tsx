"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

type Incident = { type: string; side: string; player: string; minute: string; description: string }

export interface MatchReportData {
  gameId: string
  homeTeamName: string | null
  awayTeamName: string | null
  homeScore: number | null
  awayScore: number | null
  refereeNotes: string | null
  incidents: Array<{ type: string; side: string; player: string | null; minute: number | null; description: string | null }>
}

const TYPES = ["yellow_card", "red_card", "injury", "other"]

export function MatchReport({ data }: { data: MatchReportData }) {
  const [homeScore, setHomeScore] = useState(data.homeScore?.toString() ?? "")
  const [awayScore, setAwayScore] = useState(data.awayScore?.toString() ?? "")
  const [refereeNotes, setRefereeNotes] = useState(data.refereeNotes ?? "")
  const [incidents, setIncidents] = useState<Incident[]>(
    data.incidents.map((i) => ({ type: i.type, side: i.side, player: i.player ?? "", minute: i.minute?.toString() ?? "", description: i.description ?? "" })),
  )
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")

  const addIncident = () => setIncidents((xs) => [...xs, { type: "yellow_card", side: "home", player: "", minute: "", description: "" }])
  const removeIncident = (i: number) => setIncidents((xs) => xs.filter((_, j) => j !== i))
  const setIncident = (i: number, k: keyof Incident, v: string) => setIncidents((xs) => xs.map((x, j) => (j === i ? { ...x, [k]: v } : x)))

  async function submit() {
    if (homeScore.trim() === "" || awayScore.trim() === "") {
      setStatus("error")
      return
    }
    setStatus("saving")
    try {
      const res = await fetch(`/api/referee/matches/${data.gameId}/report`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          homeScore: Number(homeScore),
          awayScore: Number(awayScore),
          refereeNotes: refereeNotes || null,
          incidents: incidents.map((x) => ({
            type: x.type, side: x.side,
            player: x.player || null,
            minute: x.minute === "" ? null : Number(x.minute),
            description: x.description || null,
          })),
        }),
      })
      setStatus(res.ok ? "saved" : "error")
    } catch {
      setStatus("error")
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-semibold">{data.homeTeamName ?? "TBD"} vs {data.awayTeamName ?? "TBD"}</h1>

      <Card>
        <CardHeader><CardTitle className="text-base">Final score</CardTitle></CardHeader>
        <CardContent className="flex items-center gap-3">
          <Input type="number" min="0" value={homeScore} onChange={(e) => setHomeScore(e.target.value)} className="w-20" aria-label="Home score" />
          <span className="text-muted-foreground">–</span>
          <Input type="number" min="0" value={awayScore} onChange={(e) => setAwayScore(e.target.value)} className="w-20" aria-label="Away score" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Incidents</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addIncident}><Plus className="h-4 w-4 mr-1" />Add</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {incidents.length === 0 && <p className="text-sm text-muted-foreground">No incidents logged.</p>}
          {incidents.map((inc, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 border-b pb-3 last:border-0">
              <select value={inc.type} onChange={(e) => setIncident(i, "type", e.target.value)} className="rounded border px-2 py-1 text-sm capitalize">
                {TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
              </select>
              <select value={inc.side} onChange={(e) => setIncident(i, "side", e.target.value)} className="rounded border px-2 py-1 text-sm">
                <option value="home">{data.homeTeamName ?? "Home"}</option>
                <option value="away">{data.awayTeamName ?? "Away"}</option>
              </select>
              <Input value={inc.player} onChange={(e) => setIncident(i, "player", e.target.value)} placeholder="Player / #" className="w-28" />
              <Input type="number" min="0" value={inc.minute} onChange={(e) => setIncident(i, "minute", e.target.value)} placeholder="min" className="w-16" />
              <Input value={inc.description} onChange={(e) => setIncident(i, "description", e.target.value)} placeholder="Notes" className="flex-1 min-w-32" />
              <Button type="button" variant="ghost" size="icon" onClick={() => removeIncident(i)} aria-label="Remove incident"><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Match notes</CardTitle></CardHeader>
        <CardContent>
          <textarea value={refereeNotes} onChange={(e) => setRefereeNotes(e.target.value)} rows={3} className="w-full rounded border px-3 py-2 text-sm" placeholder="Anything notable about the match…" />
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <Button onClick={submit} disabled={status === "saving"}>{status === "saving" ? "Saving…" : "Submit report"}</Button>
        {status === "saved" && <span className="text-sm text-green-600">Saved.</span>}
        {status === "error" && <span className="text-sm text-destructive">Couldn't save — try again.</span>}
      </div>
    </div>
  )
}
