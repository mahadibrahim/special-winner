"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, Copy, Check, Send } from "lucide-react";
import { EmbeddedPayment } from "./embedded-payment";

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

  // Invite-by-email state.
  const [inviteEmails, setInviteEmails] = useState("");
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
        depositClientSecret?: string;
        publishableKey?: string;
      };
      setInviteToken(json.inviteToken);
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

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteToken) return;
    const emails = inviteEmails
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (emails.length === 0) {
      setInviteError("Enter at least one email.");
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
          body: JSON.stringify({ emails }),
        },
      );
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? "Could not send invites");
      }
      const json = (await res.json()) as { sent: number };
      setSentCount(json.sent ?? emails.length);
      setInviteEmails("");
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
          <h4 className="font-display text-lg text-ink mb-3">Invite by email</h4>
          <p className="text-ink-muted text-sm mb-3 leading-relaxed">
            Enter one or more emails (comma or space separated). We'll send each one the
            join link.
          </p>
          <form onSubmit={handleInvite} className="space-y-3">
            <textarea
              value={inviteEmails}
              onChange={(e) => setInviteEmails(e.target.value)}
              rows={2}
              placeholder="alex@example.com, sam@example.com"
              className="w-full px-3 py-2.5 bg-paper border border-ink/15 rounded-lg text-ink placeholder:text-ink-faint focus:outline-none focus:border-primary-orange transition-colors resize-y text-sm"
            />
            {inviteError && <p className="text-sm text-red-400">{inviteError}</p>}
            {inviteStatus === "sent" && (
              <p className="text-sm text-sage">
                Sent {sentCount} invite{sentCount === 1 ? "" : "s"}.
              </p>
            )}
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
