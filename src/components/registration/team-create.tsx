"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, Copy, Check, Send, Plus, X } from "lucide-react";
import { EmbeddedPayment } from "./embedded-payment";

const CAPTAIN_DEPOSIT_CENTS = 20000; // $200 (locked decision)

/** Split a total evenly across N rows; earlier rows absorb the remainder. */
function evenSplitCents(totalCents: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(totalCents / n);
  let remainder = totalCents - base * n;
  return Array.from({ length: n }, () => (remainder-- > 0 ? base + 1 : base));
}

export default function TeamCreate({
  seasonId,
  defaultName,
  defaultEmail,
  onCaptainRegister,
}: {
  seasonId: string;
  defaultName: string;
  defaultEmail: string;
  onCaptainRegister: (inviteToken: string) => void;
}) {
  const [teamName, setTeamName] = useState("");
  const [captainName, setCaptainName] = useState(defaultName);
  const [captainEmail, setCaptainEmail] = useState(defaultEmail);
  const [notes, setNotes] = useState("");

  const [status, setStatus] = useState<
    "idle" | "submitting" | "deposit" | "ok" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Captain $200 deposit (saves a card for the post-deadline backstop charge).
  const [depositClientSecret, setDepositClientSecret] = useState<string | null>(null);
  const [depositPublishableKey, setDepositPublishableKey] = useState<string | null>(null);

  // Snapshot of the season team fee (returned by the create endpoint), used to
  // default the per-teammate even split of (teamFee − $200 captain deposit).
  const [teamFeeCents, setTeamFeeCents] = useState<number | null>(null);

  // Invite-by-email state: a repeatable list of { email, amount } rows. `amount`
  // is the dollar string the captain types; we convert to cents on submit.
  const [inviteRows, setInviteRows] = useState<{ email: string; amount: string }[]>([
    { email: "", amount: "" },
    { email: "", amount: "" },
  ]);
  const [inviteStatus, setInviteStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [sentCount, setSentCount] = useState(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("submitting");
    setError(null);

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
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? "Could not create team");
      }
      const json = (await res.json()) as {
        joinUrl: string;
        inviteToken: string;
        teamFeeCents?: number;
        depositClientSecret?: string;
        publishableKey?: string;
      };
      setInviteToken(json.inviteToken);
      if (typeof json.teamFeeCents === "number") {
        setTeamFeeCents(json.teamFeeCents);
        // Seed the two starter rows with the even split of (teamFee − $200).
        const splittable = Math.max(0, json.teamFeeCents - CAPTAIN_DEPOSIT_CENTS);
        const [a, b] = evenSplitCents(splittable, 2);
        setInviteRows([
          { email: "", amount: ((a ?? 0) / 100).toFixed(2) },
          { email: "", amount: ((b ?? 0) / 100).toFixed(2) },
        ]);
      }
      // The shareable link is the one-door register URL tagged to this team.
      setJoinUrl(
        `${window.location.origin}/register/${seasonId}?team=${encodeURIComponent(json.inviteToken)}`,
      );
      // Collect the $200 deposit before revealing the share view. If the server
      // didn't return a client secret (Stripe unconfigured), fall through to the
      // share view so the flow isn't fully blocked locally.
      if (json.depositClientSecret && json.publishableKey) {
        setDepositClientSecret(json.depositClientSecret);
        setDepositPublishableKey(json.publishableKey);
        setStatus("deposit");
      } else {
        setStatus("ok");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create team");
      setStatus("error");
    }
  };

  const handleCopy = async () => {
    if (!joinUrl) return;
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked — user can manually select.
    }
  };

  const updateRow = (idx: number, patch: Partial<{ email: string; amount: string }>) => {
    setInviteRows((rows) => rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const addRow = () => {
    // Default new rows to the even split of (teamFee − $200) across one share.
    const splittable =
      teamFeeCents != null ? Math.max(0, teamFeeCents - CAPTAIN_DEPOSIT_CENTS) : 0;
    const dflt = teamFeeCents != null ? (splittable / 100).toFixed(2) : "";
    setInviteRows((rows) => [...rows, { email: "", amount: dflt }]);
  };
  const removeRow = (idx: number) => {
    setInviteRows((rows) =>
      rows.length <= 1 ? rows : rows.filter((_, i) => i !== idx),
    );
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteToken) return;
    const invites = inviteRows
      .map((r) => ({
        email: r.email.trim().toLowerCase(),
        shareCents: Math.round(parseFloat(r.amount || "0") * 100),
      }))
      .filter((r) => r.email);
    if (invites.length === 0) {
      setInviteError("Enter at least one email.");
      setInviteStatus("error");
      return;
    }
    if (invites.some((r) => !Number.isFinite(r.shareCents) || r.shareCents < 0)) {
      setInviteError("Enter a valid amount for each teammate.");
      setInviteStatus("error");
      return;
    }
    setInviteStatus("sending");
    setInviteError(null);
    try {
      const res = await fetch(
        `/api/public/team-registrations/${encodeURIComponent(inviteToken)}/invite`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ invites }),
        },
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? "Could not send invites");
      }
      const json = (await res.json()) as { sent: number };
      setSentCount(json.sent ?? invites.length);
      setInviteStatus("sent");
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : "Could not send invites");
      setInviteStatus("error");
    }
  };

  if (status === "deposit" && depositClientSecret && depositPublishableKey) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted">
            Step 2 of 4
          </p>
          <h1 className="font-display text-2xl text-ink mt-1 mb-2">
            Reserve your team
          </h1>
          <p className="text-ink-2 leading-relaxed text-sm">
            $200 deposit · credits the team fee · unpaid teammate shares are
            charged to this card after the deadline.
          </p>
        </div>
        <EmbeddedPayment
          clientSecret={depositClientSecret}
          publishableKey={depositPublishableKey}
          seasonItem={{
            id: seasonId,
            name: teamName.trim() || "Team deposit",
            category: "Team",
            category2: "Team",
            priceCents: 20000,
          }}
          valueCents={20000}
          paymentType="deposit"
          returnUrl={`${typeof window !== "undefined" ? window.location.origin : ""}/register/${seasonId}?team=${encodeURIComponent(inviteToken ?? "")}`}
          onSuccess={() => setStatus("ok")}
          onCancel={() => {
            // Back out of the deposit; the team row exists but is unpaid. Let
            // the captain retry by re-rendering the form.
            setStatus("idle");
            setDepositClientSecret(null);
            setDepositPublishableKey(null);
          }}
        />
      </div>
    );
  }

  if (status === "ok" && joinUrl) {
    return (
      <div className="space-y-6">
        <div className="bg-cream-2 border border-primary-orange/30 rounded-2xl p-6">
          <div className="flex items-start gap-4 mb-6">
            <CheckCircle2 className="w-6 h-6 text-primary-orange flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-display text-2xl text-ink mb-2">Team created.</h3>
              <p className="text-ink-2 leading-relaxed text-sm">
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
          <h4 className="font-display text-lg text-ink mb-3">Invite teammates</h4>
          <p className="text-ink-muted text-sm mb-3 leading-relaxed">
            Add each teammate's email and the share they should pay. We default
            to an even split of the team fee minus your $200 deposit — adjust any
            amount as you like. Each teammate pays exactly their share when they
            register.
          </p>
          <form onSubmit={handleInvite} className="space-y-3">
            {inviteRows.map((row, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="email"
                  value={row.email}
                  onChange={(e) => updateRow(idx, { email: e.target.value })}
                  placeholder="teammate@example.com"
                  className="flex-1 px-3 py-2.5 bg-paper border border-ink/15 rounded-lg text-ink placeholder:text-ink-faint focus:outline-none focus:border-primary-orange transition-colors text-sm"
                />
                <div className="relative w-28">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted text-sm">
                    $
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.amount}
                    onChange={(e) => updateRow(idx, { amount: e.target.value })}
                    placeholder="0.00"
                    className="w-full pl-6 pr-2 py-2.5 bg-paper border border-ink/15 rounded-lg text-ink focus:outline-none focus:border-primary-orange transition-colors text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeRow(idx)}
                  disabled={inviteRows.length <= 1}
                  aria-label="Remove teammate"
                  className="p-2 text-ink-muted hover:text-red-500 transition-colors disabled:opacity-30"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addRow}
              className="inline-flex items-center gap-1.5 text-sm text-ink-2 hover:text-primary-orange transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add another teammate
            </button>
            {inviteError && <p className="text-sm text-red-400">{inviteError}</p>}
            {inviteStatus === "sent" && (
              <p className="text-sm text-sage">
                Sent {sentCount} invite{sentCount === 1 ? "" : "s"}.
              </p>
            )}
            <div>
              <button
                type="submit"
                disabled={inviteStatus === "sending"}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-ink text-cream rounded-lg hover:bg-primary-orange transition-colors text-sm disabled:opacity-60"
              >
                {inviteStatus === "sending" ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Sending…
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send invites
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        <div className="bg-paper border border-ink/10 rounded-2xl p-6">
          <h4 className="font-display text-lg text-ink mb-3">Next: register yourself</h4>
          <p className="text-ink-muted text-sm mb-4 leading-relaxed">
            Captains complete their own registration like any other player. Click below to
            sign up; your registration will be tagged to this team.
          </p>
          <button
            type="button"
            onClick={() => inviteToken && onCaptainRegister(inviteToken)}
            className="inline-flex items-center gap-3 bg-ink text-cream px-6 py-3 text-sm font-medium tracking-wide uppercase hover:bg-primary-orange transition-colors"
            style={{ letterSpacing: "0.08em" }}
          >
            Register myself as a player →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted">
        Step 1 of 4
      </p>
      <h1 className="font-display text-2xl text-ink mt-1 mb-4">Bring a team</h1>
      <form onSubmit={handleSubmit} className="space-y-5">
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
    </div>
  );
}
