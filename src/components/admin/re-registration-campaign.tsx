"use client"

import { useEffect, useState } from "react"
import {
  Loader2,
  Send,
  Users,
  AlertCircle,
  CheckCircle2,
  Eye,
} from "lucide-react"
import { Button } from "@/components/ui/button"

interface SeasonOption {
  id: string
  name: string
  programName: string
}

interface DryRunResult {
  dryRun: true
  wouldContact: number
  preview: Array<{
    parentName: string | null
    parentEmail: string
    kidName: string
  }>
  previewTruncated: boolean
}

interface SendResult {
  success: true
  contacted: number
  skipped: number
  totalCandidates: number
}

export function ReRegistrationCampaign() {
  const [seasons, setSeasons] = useState<SeasonOption[]>([])
  const [loadingSeasons, setLoadingSeasons] = useState(true)
  const [seasonId, setSeasonId] = useState("")
  const [running, setRunning] = useState<"dry" | "send" | null>(null)
  const [dryRun, setDryRun] = useState<DryRunResult | null>(null)
  const [sendResult, setSendResult] = useState<SendResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadSeasons() {
      try {
        const res = await fetch("/api/admin/seasons?status=open")
        const data = await res.json()
        const opts: SeasonOption[] = (data.seasons || []).map((s: {
          id: string
          name: string
          program?: { name?: string }
        }) => ({
          id: s.id,
          name: s.name,
          programName: s.program?.name ?? "Unknown program",
        }))
        setSeasons(opts)
        if (opts.length > 0) setSeasonId(opts[0].id)
      } catch (err) {
        console.error(err)
      } finally {
        setLoadingSeasons(false)
      }
    }
    loadSeasons()
  }, [])

  async function runCampaign(dryRun: boolean) {
    if (!seasonId) return
    setRunning(dryRun ? "dry" : "send")
    setError(null)
    if (!dryRun) setDryRun(null)
    setSendResult(null)

    try {
      const res = await fetch("/api/admin/re-registration-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonId, dryRun }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || `Campaign failed (${res.status})`)
      }
      if (dryRun) {
        setDryRun(data)
      } else {
        setSendResult(data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Campaign failed")
    } finally {
      setRunning(null)
    }
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="p-5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
        <label className="block text-sm font-semibold text-white mb-2">
          Target season
        </label>
        <select
          value={seasonId}
          onChange={(e) => {
            setSeasonId(e.target.value)
            setDryRun(null)
            setSendResult(null)
          }}
          disabled={loadingSeasons}
          className="w-full px-3 py-2 rounded-md bg-white/[0.03] border border-white/[0.08] text-sm text-white"
        >
          <option value="">
            {loadingSeasons ? "Loading seasons..." : "Pick a new season"}
          </option>
          {seasons.map((s) => (
            <option key={s.id} value={s.id}>
              {s.programName} — {s.name}
            </option>
          ))}
        </select>
        <p className="mt-2 text-xs text-gray-500">
          The campaign will find every parent who had a <strong>confirmed</strong> registration
          in a <strong>past season</strong> of the same program as this new season, then send
          them a magic-link text to re-register in ~30 seconds. Links expire in 72 hours.
        </p>
      </div>

      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={() => runCampaign(true)}
          disabled={!seasonId || running !== null}
          className="flex-1"
        >
          {running === "dry" ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Running preview...
            </>
          ) : (
            <>
              <Eye className="w-4 h-4 mr-2" />
              Dry run (no messages sent)
            </>
          )}
        </Button>
        <Button
          onClick={() => {
            if (
              confirm(
                `This will send a re-registration text/email to every returning family for the selected season. Continue?`,
              )
            ) {
              runCampaign(false)
            }
          }}
          disabled={!seasonId || running !== null}
          className="flex-1"
        >
          {running === "send" ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <Send className="w-4 h-4 mr-2" />
              Send campaign
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {dryRun && (
        <div className="p-5 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="w-5 h-5 text-blue-400" />
            <h3 className="font-semibold text-white">Dry run — no messages sent</h3>
          </div>
          <p className="text-sm text-gray-300 mb-4">
            <strong>{dryRun.wouldContact}</strong> returning{" "}
            {dryRun.wouldContact === 1 ? "family" : "families"} would be contacted.
            {dryRun.previewTruncated && (
              <span className="text-gray-500"> Showing first 20.</span>
            )}
          </p>
          {dryRun.preview.length > 0 ? (
            <ul className="space-y-1.5 text-xs max-h-64 overflow-y-auto">
              {dryRun.preview.map((p, i) => (
                <li
                  key={i}
                  className="flex items-center gap-3 p-2 rounded bg-white/[0.03]"
                >
                  <Users className="w-3 h-3 text-gray-500 flex-shrink-0" />
                  <span className="text-gray-300 flex-1">
                    {p.parentName ?? "Unknown"} — {p.kidName}
                  </span>
                  <span className="text-gray-500">{p.parentEmail}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-gray-500 italic">
              No returning families found for this program. You might need to pick a
              different season, or this might be the program's first-ever run.
            </p>
          )}
        </div>
      )}

      {sendResult && (
        <div className="p-5 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <h3 className="font-semibold text-white">Campaign sent</h3>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center mt-4">
            <div className="p-3 rounded-lg bg-white/[0.03]">
              <div className="text-2xl font-bold text-emerald-400">
                {sendResult.contacted}
              </div>
              <div className="text-xs text-gray-500">contacted</div>
            </div>
            <div className="p-3 rounded-lg bg-white/[0.03]">
              <div className="text-2xl font-bold text-amber-400">
                {sendResult.skipped}
              </div>
              <div className="text-xs text-gray-500">skipped</div>
            </div>
            <div className="p-3 rounded-lg bg-white/[0.03]">
              <div className="text-2xl font-bold text-white">
                {sendResult.totalCandidates}
              </div>
              <div className="text-xs text-gray-500">total candidates</div>
            </div>
          </div>
          <p className="mt-4 text-xs text-gray-500">
            Monitor the /messages inbox for parent replies. Skipped sends were usually
            opted-out parents or parents missing verified contact channels — check the
            server logs for details.
          </p>
        </div>
      )}
    </div>
  )
}
