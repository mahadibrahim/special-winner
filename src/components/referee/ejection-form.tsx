"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ErrorBanner } from "@/components/ui/error-banner"

type LoggedEjection = {
  id: string
  side: "home" | "away"
  player: string
  minute: number | null
  reason: string
  gamesMissed: number | null
}

/**
 * Standalone ejection capture card (product-backlog build #4). Posts to the
 * new additive-only POST /api/referee/matches/[gameId]/ejections — never
 * folded into MatchReport's bulk `incidents` array, which deletes-all and
 * reinserts on every /report submit (see report.ts). Appends each
 * successfully-logged ejection to a read-only local list; there is no
 * edit/void in v1 (see the plan's follow-on list).
 */
export function EjectionForm({ gameId, homeTeamName, awayTeamName }: {
  gameId: string
  homeTeamName: string | null
  awayTeamName: string | null
}) {
  const [side, setSide] = useState<"home" | "away">("home")
  const [player, setPlayer] = useState("")
  const [minute, setMinute] = useState("")
  const [reason, setReason] = useState("")
  const [carriesSuspension, setCarriesSuspension] = useState(true)
  const [gamesMissed, setGamesMissed] = useState("1")
  const [suspensionNotes, setSuspensionNotes] = useState("")
  const [escalatedToDirector, setEscalatedToDirector] = useState(false)
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [error, setError] = useState<string | null>(null)
  const [logged, setLogged] = useState<LoggedEjection[]>([])

  function reset() {
    setPlayer("")
    setMinute("")
    setReason("")
    setCarriesSuspension(true)
    setGamesMissed("1")
    setSuspensionNotes("")
    setEscalatedToDirector(false)
  }

  async function submit() {
    setError(null)
    if (player.trim() === "" || reason.trim() === "") {
      setError("Player and reason are required.")
      setStatus("error")
      return
    }
    setStatus("saving")
    try {
      const res = await fetch(`/api/referee/matches/${gameId}/ejections`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          side,
          player,
          minute: minute === "" ? null : Number(minute),
          reason,
          carriesSuspension,
          gamesMissed: carriesSuspension && gamesMissed !== "" ? Number(gamesMissed) : null,
          suspensionNotes: suspensionNotes || null,
          escalatedToDirector,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        setError(body?.error ?? `Couldn't save (status ${res.status}).`)
        setStatus("error")
        return
      }
      const body = await res.json()
      setLogged((xs) => [
        {
          id: body.incident.id,
          side,
          player,
          minute: minute === "" ? null : Number(minute),
          reason,
          gamesMissed: body.suspension?.gamesMissed ?? null,
        },
        ...xs,
      ])
      setStatus("saved")
      reset()
    } catch {
      setError("Network error — try again.")
      setStatus("error")
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-base">Log an ejection</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Side"
            value={side}
            onChange={(e) => setSide(e.target.value as "home" | "away")}
            className="rounded border px-2 py-1 text-sm"
          >
            <option value="home">{homeTeamName ?? "Home"}</option>
            <option value="away">{awayTeamName ?? "Away"}</option>
          </select>
          <Input
            value={player}
            onChange={(e) => setPlayer(e.target.value)}
            placeholder="Player / #"
            aria-label="Player"
            className="w-40"
          />
          <Input
            type="number"
            min="0"
            value={minute}
            onChange={(e) => setMinute(e.target.value)}
            placeholder="min"
            aria-label="Minute"
            className="w-20"
          />
        </div>

        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="w-full rounded border px-3 py-2 text-sm"
          placeholder="Reason for the ejection…"
          aria-label="Reason"
        />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={carriesSuspension}
            onChange={(e) => setCarriesSuspension(e.target.checked)}
          />
          This ejection carries a suspension
        </label>

        {carriesSuspension && (
          <div className="space-y-3 border-l-2 pl-4">
            <div className="flex items-center gap-2">
              <label htmlFor="games-missed" className="text-sm text-muted-foreground">
                Games missed
              </label>
              <Input
                id="games-missed"
                type="number"
                min="0"
                value={gamesMissed}
                onChange={(e) => setGamesMissed(e.target.value)}
                className="w-20"
              />
            </div>
            <textarea
              value={suspensionNotes}
              onChange={(e) => setSuspensionNotes(e.target.value)}
              rows={2}
              className="w-full rounded border px-3 py-2 text-sm"
              placeholder="Suspension notes (optional)…"
              aria-label="Suspension notes"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={escalatedToDirector}
                onChange={(e) => setEscalatedToDirector(e.target.checked)}
              />
              Flag for director review (repeat offense / escalation)
            </label>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Button onClick={submit} disabled={status === "saving"} variant="destructive">
            {status === "saving" ? "Logging…" : "Log ejection"}
          </Button>
          {status === "saved" && <span className="text-sm text-green-600">Logged.</span>}
        </div>

        {logged.length > 0 && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Logged this session
            </p>
            <ul className="space-y-1 text-sm">
              {logged.map((e) => (
                <li key={e.id}>
                  {e.player} ({e.side === "home" ? homeTeamName ?? "Home" : awayTeamName ?? "Away"})
                  {e.minute != null ? ` — ${e.minute}'` : ""} — {e.reason}
                  {e.gamesMissed != null ? ` (${e.gamesMissed} game${e.gamesMissed === 1 ? "" : "s"} missed)` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
