"use client"

import { useState } from "react"
import { Loader2, CheckCircle2, Copy, Check } from "lucide-react"

interface Props {
  seasonId: string
  seasonName: string
  defaultCaptainName?: string
  defaultCaptainEmail?: string
}

export default function CreateTeamForm({
  seasonId,
  seasonName,
  defaultCaptainName = "",
  defaultCaptainEmail = "",
}: Props) {
  const [teamName, setTeamName] = useState("")
  const [captainName, setCaptainName] = useState(defaultCaptainName)
  const [captainEmail, setCaptainEmail] = useState(defaultCaptainEmail)
  const [notes, setNotes] = useState("")

  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">("idle")
  const [error, setError] = useState<string | null>(null)
  const [joinUrl, setJoinUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setStatus("submitting")
    setError(null)

    try {
      const res = await fetch("/api/public/team-registrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seasonId,
          teamName: teamName.trim(),
          captainName: captainName.trim(),
          captainEmail: captainEmail.trim(),
          notes: notes.trim() || undefined,
        }),
      })
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(json.error ?? "Could not create team")
      }
      const json = (await res.json()) as { joinUrl: string }
      setJoinUrl(`${window.location.origin}${json.joinUrl}`)
      setStatus("ok")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create team")
      setStatus("error")
    }
  }

  const handleCopy = async () => {
    if (!joinUrl) return
    try {
      await navigator.clipboard.writeText(joinUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard blocked — user can manually select
    }
  }

  if (status === "ok" && joinUrl) {
    return (
      <div className="space-y-6">
        <div className="bg-cream-2 border border-primary-orange/30 rounded-2xl p-8">
          <div className="flex items-start gap-4 mb-6">
            <CheckCircle2 className="w-6 h-6 text-primary-orange flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-display text-2xl text-ink mb-2">Team created.</h3>
              <p className="text-ink-2 leading-relaxed">
                Share the link below with your players. Each one clicks it, registers, and
                pays their share. You'll see them join your roster as they complete signup.
              </p>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted mb-2">
              Team join link
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={joinUrl}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="flex-1 px-3 py-2.5 bg-paper border border-ink/15 rounded-lg text-ink text-sm focus:outline-none focus:border-primary-orange"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-ink text-cream rounded-lg hover:bg-primary-orange transition-colors text-sm"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="bg-paper border border-ink/10 rounded-2xl p-6">
          <h4 className="font-display text-lg text-ink mb-3">Next: register yourself</h4>
          <p className="text-ink-muted text-sm mb-4 leading-relaxed">
            Captains complete their own registration like any other player. Click below to
            sign up for {seasonName}; the system will tag your registration to this team.
          </p>
          <a
            href={`/register/${seasonId}?team=${encodeURIComponent(joinUrl.split("/").pop() ?? "")}`}
            className="inline-flex items-center gap-3 bg-ink text-cream px-6 py-3 text-sm font-medium tracking-wide uppercase hover:bg-primary-orange transition-colors"
            style={{ letterSpacing: "0.08em" }}
          >
            Register as captain →
          </a>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div>
        <label className="block">
          <span className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted block mb-2">
            Team name <span className="text-primary-orange">*</span>
          </span>
          <input
            type="text"
            required
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            maxLength={200}
            placeholder="e.g. The Last Pick, FC Worthington, Friday Crew"
            className="w-full px-3 py-2.5 bg-paper border border-ink/15 rounded-lg text-ink placeholder:text-ink-faint focus:outline-none focus:border-primary-orange transition-colors"
          />
        </label>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="block">
          <span className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted block mb-2">
            Your name <span className="text-primary-orange">*</span>
          </span>
          <input
            type="text"
            required
            value={captainName}
            onChange={(e) => setCaptainName(e.target.value)}
            maxLength={200}
            className="w-full px-3 py-2.5 bg-paper border border-ink/15 rounded-lg text-ink focus:outline-none focus:border-primary-orange transition-colors"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted block mb-2">
            Your email <span className="text-primary-orange">*</span>
          </span>
          <input
            type="email"
            required
            value={captainEmail}
            onChange={(e) => setCaptainEmail(e.target.value)}
            maxLength={320}
            className="w-full px-3 py-2.5 bg-paper border border-ink/15 rounded-lg text-ink focus:outline-none focus:border-primary-orange transition-colors"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted block mb-2">
          Anything we should know? (optional)
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder="Returning team from last season, schedule preferences, etc."
          className="w-full px-3 py-2.5 bg-paper border border-ink/15 rounded-lg text-ink focus:outline-none focus:border-primary-orange transition-colors resize-y"
        />
      </label>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={status === "submitting"}
        className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-ink text-cream text-sm font-medium tracking-wide uppercase hover:bg-primary-orange transition-colors disabled:opacity-60"
        style={{ letterSpacing: "0.08em" }}
      >
        {status === "submitting" ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Creating team…
          </>
        ) : (
          "Create team & get link →"
        )}
      </button>
    </form>
  )
}
