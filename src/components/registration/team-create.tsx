"use client";

import { useState, useEffect, useCallback } from "react";
import { Loader2, CheckCircle2, Copy, Check, Send, Plus, X, Mail } from "lucide-react";
import { EmbeddedPayment } from "./embedded-payment";
import { CAPTAIN_DEPOSIT_CENTS, CAPTAIN_DEPOSIT_DOLLARS } from "@/lib/registrations/team-deposit";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { teamPriceStory } from "@/lib/leagues/rail-content";
import { formatDateOnly } from "@/lib/time/format-date";
import {
  trackTeamCreateViewed,
  trackTeamCreateSubmitted,
  trackTeamDepositViewed,
  trackTeamHqViewed,
} from "@/lib/analytics/events";

// localStorage key for the pending captain form of a signed-out visitor —
// stashed before we send them a magic link, rehydrated when they return
// authed to /register/{seasonId}?mode=team.
const teamDraftKey = (seasonId: string) => `aspire:teamdraft:${seasonId}`;

interface TeamDraft {
  v: 1;
  teamName: string;
  captainName: string;
  captainEmail: string;
  notes: string;
}

/** Split a total evenly across N rows; earlier rows absorb the remainder. */
function evenSplitCents(totalCents: number, n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(totalCents / n);
  let remainder = totalCents - base * n;
  return Array.from({ length: n }, () => (remainder-- > 0 ? base + 1 : base));
}

/** Format cents as a $-prefixed dollar amount (e.g. 20000 → "$200"). */
function fmtCents(cents: number): string {
  const dollars = cents / 100;
  return `$${Number.isInteger(dollars) ? dollars.toString() : dollars.toFixed(2)}`;
}

type PaymentSummary = {
  teamFeeCents: number | null;
  depositCents: number;
  collectedCents: number;
  invitees: {
    email: string;
    assignedShareCents: number | null;
    status: string;
  }[];
};

/**
 * Live payment tracker shown after the captain pays their deposit. Polls the
 * team-registrations GET endpoint (and re-fetches on window focus) so the
 * captain watches collected-vs-total climb as teammates pay their shares.
 */
function PaymentTracker({ inviteToken }: { inviteToken: string }) {
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/public/team-registrations/${encodeURIComponent(inviteToken)}`,
      );
      if (!res.ok) return;
      const json = (await res.json()) as { payment?: PaymentSummary };
      if (json.payment) setSummary(json.payment);
    } catch {
      // Transient — leave the last good value on screen.
    } finally {
      setLoading(false);
    }
  }, [inviteToken]);

  useEffect(() => {
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  if (loading && !summary) {
    return (
      <div className="bg-paper border border-ink/10 rounded-2xl p-6">
        <div className="flex items-center gap-2 text-ink-muted text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          Loading payment status…
        </div>
      </div>
    );
  }
  if (!summary) return null;

  const { teamFeeCents, collectedCents, invitees } = summary;
  const pct =
    teamFeeCents && teamFeeCents > 0
      ? Math.min(100, Math.round((collectedCents / teamFeeCents) * 100))
      : 0;

  return (
    <div className="bg-paper border border-ink/10 rounded-2xl p-6">
      <h4 className="font-display text-lg text-ink mb-3">Payment tracker</h4>

      <div className="h-2.5 w-full rounded-full bg-cream-2 overflow-hidden mb-2">
        <div
          className="h-full rounded-full bg-sage transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-sm text-ink-2 mb-4">
        <span className="font-semibold text-ink">{fmtCents(collectedCents)}</span>
        {" of "}
        {teamFeeCents != null ? fmtCents(teamFeeCents) : "—"} collected
      </p>

      {invitees.length > 0 && (
        <ul className="space-y-2">
          {invitees.map((inv, idx) => {
            const paid = inv.status === "paid";
            return (
              <li
                key={`${inv.email}-${idx}`}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <span
                    aria-hidden
                    className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                      paid ? "bg-sage" : "bg-ink/25"
                    }`}
                  />
                  <span className="truncate text-ink-2">{inv.email}</span>
                </span>
                <span className="flex items-center gap-2 flex-shrink-0">
                  {inv.assignedShareCents != null && (
                    <span className="text-ink-muted">
                      {fmtCents(inv.assignedShareCents)}
                    </span>
                  )}
                  {paid ? (
                    <span className="inline-flex items-center gap-1 text-sage">
                      <Check className="w-3.5 h-3.5" /> paid
                    </span>
                  ) : (
                    <span className="text-ink-muted">invited</span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function TeamCreate({
  seasonId,
  isAuthed,
  defaultName,
  defaultEmail,
  onCaptainRegister,
  onStepChange,
  onDiscountChange,
  season,
}: {
  seasonId: string;
  /** Whether the register page has a signed-in user. Signed-out captains get
      the magic-link path instead of a dead 401 from the create endpoint. */
  isAuthed: boolean;
  defaultName: string;
  defaultEmail: string;
  onCaptainRegister: (inviteToken: string) => void;
  /** Reports the team flow's step (1 details → 2 reserve → 3 register/invite)
      up to the context rail's progress bar. */
  onStepChange?: (step: number) => void;
  /** Reports an applied team discount (cents) so the rail's total + roster
      split reflect it. null = none. */
  onDiscountChange?: (cents: number | null) => void;
  /** Season pricing/deadline snapshot from the register page's detail fetch —
      renders the fee box + deadline BEFORE the deposit charge. Optional so the
      component stays render-safe if the parent ever mounts it without one. */
  season?: {
    price: number;
    teamPrice: number | null;
    effectiveTeamPrice?: number | null;
    teamEarlyBirdActive?: boolean;
    registrationCloses?: string | null;
  };
}) {
  const [teamName, setTeamName] = useState("");
  const [captainName, setCaptainName] = useState(defaultName);
  const [captainEmail, setCaptainEmail] = useState(defaultEmail);
  const [notes, setNotes] = useState("");

  const [status, setStatus] = useState<
    "idle" | "submitting" | "deposit" | "ok" | "error" | "link_sent"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  // Distinguishes why we landed on link_sent: an anonymous submit whose email
  // already has an account (409) gets different copy than the stale-session
  // 401 fallback below.
  const [linkSentReason, setLinkSentReason] = useState<"account_exists" | null>(null);
  // Cloudflare Turnstile token — only rendered/collected for signed-out
  // captains, whose submit goes to the magic-link auth endpoints (which
  // verify Turnstile server-side and fail closed in prod).
  const [turnstileToken, setTurnstileToken] = useState("");
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

  // Applied team discount (reduces the team total, never the $200 deposit).
  // Set on the reserve screen; the server stores it on the team registration
  // so the roster split and any backstop charge inherit the reduced total.
  const [discount, setDiscount] = useState<{ code: string; cents: number } | null>(null);
  const [discountInput, setDiscountInput] = useState("");
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountBusy, setDiscountBusy] = useState(false);
  const [discountError, setDiscountError] = useState<string | null>(null);

  // Fee box math — display-only; the server recomputes the fee at create time.
  const story = season ? teamPriceStory(season) : null;
  const baseFeeDollars = season ? (season.effectiveTeamPrice ?? season.teamPrice ?? season.price) : null;
  const discountDollars = (discount?.cents ?? 0) / 100;
  const feeTotalDollars = baseFeeDollars != null ? Math.max(0, baseFeeDollars - discountDollars) : null;
  const rosterRemainderDollars =
    feeTotalDollars != null ? Math.max(0, feeTotalDollars - CAPTAIN_DEPOSIT_CENTS / 100) : null;
  // registrationCloses is a full ISO instant (not a date-only column), so it
  // must be pinned to the org timezone (America/New_York) — otherwise it
  // renders in the viewer's local zone and can disagree with the receipt
  // email, which formats the same instant in America/New_York.
  const deadlineLabel = season?.registrationCloses
    ? formatDateOnly(season.registrationCloses, {
        month: "short",
        day: "numeric",
        timeZone: "America/New_York",
      })
    : null;

  // Funnel eventing — one fire per state entry. Keyed on `status` so React's
  // effect-dependency semantics do the guarding: the body only reruns when
  // `status` actually changes value, never on an unrelated re-render.
  useEffect(() => {
    if (status === "idle") trackTeamCreateViewed({ seasonId });
    else if (status === "submitting") trackTeamCreateSubmitted({ seasonId, authed: isAuthed });
    else if (status === "deposit") trackTeamDepositViewed({ seasonId });
    else if (status === "ok") trackTeamHqViewed({ seasonId });
  }, [status, seasonId, isAuthed]);

  // Mirror the flow step + applied discount up to the context rail.
  useEffect(() => {
    onStepChange?.(status === "deposit" ? 2 : status === "ok" ? 3 : 1);
  }, [status, onStepChange]);
  useEffect(() => {
    onDiscountChange?.(discount?.cents ?? null);
  }, [discount, onDiscountChange]);

  // Apply / remove a discount code against the just-created team. The endpoint
  // validates the code and rewrites the stored team fee; we mirror its result
  // into local state so the fee box + rail + invite defaults all agree.
  const applyDiscount = async () => {
    const code = discountInput.trim();
    if (!code || !inviteToken) return;
    setDiscountBusy(true);
    setDiscountError(null);
    try {
      const res = await fetch(
        `/api/public/team-registrations/${encodeURIComponent(inviteToken)}/discount`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        },
      );
      const json = await res.json();
      if (!res.ok || !json.applied) {
        setDiscountError(json.error ?? "That code isn't valid for this league.");
        return;
      }
      setDiscount({ code: json.code, cents: json.discountCents });
      if (typeof json.teamFeeCents === "number") setTeamFeeCents(json.teamFeeCents);
      setDiscountInput("");
      setDiscountOpen(false);
    } catch {
      setDiscountError("Couldn't apply that code. Please try again.");
    } finally {
      setDiscountBusy(false);
    }
  };

  const removeDiscount = async () => {
    if (!inviteToken) return;
    setDiscountBusy(true);
    setDiscountError(null);
    try {
      const res = await fetch(
        `/api/public/team-registrations/${encodeURIComponent(inviteToken)}/discount`,
        { method: "DELETE" },
      );
      const json = await res.json();
      if (res.ok && typeof json.teamFeeCents === "number") setTeamFeeCents(json.teamFeeCents);
    } catch {
      // Best-effort — a failed remove just leaves the discount applied.
    } finally {
      setDiscount(null);
      setDiscountBusy(false);
    }
  };

  // Rehydrate a stashed form on return (the signed-out captain tapped their
  // magic link and landed back on /register/{seasonId}?mode=team, now authed).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(teamDraftKey(seasonId));
      if (!raw) return;
      const d = JSON.parse(raw) as TeamDraft;
      if (d?.v !== 1) return;
      if (d.teamName) setTeamName(d.teamName);
      if (d.captainName) setCaptainName(d.captainName);
      if (d.captainEmail) setCaptainEmail(d.captainEmail);
      if (d.notes) setNotes(d.notes);
    } catch {
      // corrupt stash — ignore
    }
  }, [seasonId]);

  const stashDraft = () => {
    if (typeof window === "undefined") return;
    try {
      const draft: TeamDraft = {
        v: 1,
        teamName: teamName.trim(),
        captainName: captainName.trim(),
        captainEmail: captainEmail.trim(),
        notes: notes.trim(),
      };
      window.localStorage.setItem(teamDraftKey(seasonId), JSON.stringify(draft));
    } catch {
      // storage disabled/full — non-fatal, the user just retypes
    }
  };

  const clearDraft = () => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.removeItem(teamDraftKey(seasonId));
    } catch {
      // non-fatal
    }
  };

  /**
   * Signed-out path: stash the form and email a one-tap magic link that lands
   * back on this exact page (mode=team). Reuses the existing passwordless
   * auth — /api/auth/signup for new emails, /api/auth/forgot-password (the
   * canonical magic-link issuer) for existing accounts. No new auth built.
   */
  const requestMagicLink = async (): Promise<void> => {
    const email = captainEmail.trim().toLowerCase();
    const redirectTo = `/register/${seasonId}?mode=team`;
    stashDraft();

    // Existing account? check-email doesn't consume the (single-use)
    // Turnstile token, so we can branch before the one token-spending call.
    let exists = true; // default to sign-in link (never creates an account)
    try {
      const r = await fetch(`/api/auth/check-email?email=${encodeURIComponent(email)}`);
      if (r.ok) exists = (await r.json()).exists === true;
    } catch {
      // network blip — keep the safe default
    }

    if (!exists) {
      const parts = captainName.trim().split(/\s+/);
      const firstName = parts[0] || "Captain";
      const lastName = parts.slice(1).join(" ") || firstName;
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          firstName,
          lastName,
          turnstileToken: turnstileToken || undefined,
          redirectTo,
        }),
      });
      if (res.ok) return;
      if (res.status !== 409) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? "Could not send your sign-in link");
      }
      // 409 → account exists after all; fall through to the sign-in link.
    }

    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        turnstileToken: turnstileToken || undefined,
        redirectTo,
      }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(json.error ?? "Could not send your sign-in link");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("submitting");
    setError(null);
    setLinkSentReason(null);

    // Anonymous captains POST directly — same as authed — rather than
    // pre-emptively detouring through a magic link. The endpoint accepts
    // anonymous callers: a new email upserts a guest account + session and
    // creates the team in one request; an existing email 409s below without
    // creating a team.
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
          backstopConsent: true,
        }),
      });
      if (!res.ok) {
        // Anonymous submit, email already has an account: no team was
        // created server-side — fall back to the existing magic-link flow so
        // the real owner can sign in and pick this up.
        if (res.status === 409) {
          try {
            await requestMagicLink();
            setLinkSentReason("account_exists");
            setStatus("link_sent");
            return;
          } catch (err) {
            throw new Error(
              err instanceof Error ? err.message : "Could not send your sign-in link",
            );
          }
        }
        // Friendly fallback: a stale session can still 401 here even though
        // the page thought we were signed in — fall back to the magic link
        // instead of surfacing the raw error.
        if (res.status === 401) {
          try {
            await requestMagicLink();
            setStatus("link_sent");
            return;
          } catch {
            throw new Error(
              "Please sign in to reserve a team — we couldn't send a sign-in link automatically.",
            );
          }
        }
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? "Could not create team");
      }
      clearDraft();
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

  /**
   * Tell the server a deposit PaymentIntent succeeded, right after Stripe.js
   * confirms it client-side — a bridge over the payment_intent.succeeded
   * webhook's lag window (mirrors recordConfirmedPayment's role for
   * registration payments, but this one is money-relevant server state, not
   * a localStorage display hint, so it has to be a real request that the
   * server re-verifies against Stripe). Never throws — a failure here just
   * means the credit stays invisible until the webhook lands on its own.
   */
  const confirmDeposit = async (paymentIntentId: string): Promise<void> => {
    if (!inviteToken) return;
    try {
      const res = await fetch(
        `/api/public/team-registrations/${encodeURIComponent(inviteToken)}/confirm-deposit`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentIntentId }),
        },
      );
      if (!res.ok) {
        console.error("[team-create] confirm-deposit failed", res.status);
      }
    } catch (err) {
      console.error("[team-create] confirm-deposit request failed", err);
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

  if (status === "link_sent") {
    return (
      <div className="bg-cream-2 border border-primary-orange/30 rounded-2xl p-6">
        <div className="flex items-start gap-4">
          <Mail className="w-6 h-6 text-primary-orange flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-display text-2xl text-ink mb-2">Check your inbox</h3>
            {linkSentReason === "account_exists" ? (
              <p className="text-ink-2 leading-relaxed text-sm">
                This email already has an account — we sent you a sign-in
                link to continue.
              </p>
            ) : (
              <p className="text-ink-2 leading-relaxed text-sm">
                Tap the link we sent to{" "}
                <strong className="text-ink">{captainEmail.trim()}</strong> and
                your team picks up right here. No password needed.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (status === "deposit" && depositClientSecret && depositPublishableKey) {
    return (
      <div className="space-y-6">
        <div className="space-y-4">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted">
              Step 2 of 4 · Required
            </p>
            <h1 className="font-display text-2xl text-ink mt-1 mb-2">
              Reserve your team
            </h1>
            <p className="text-ink-2 text-sm leading-relaxed">
              <b>${CAPTAIN_DEPOSIT_DOLLARS}</b> reserves your team today. Your roster
              splits the rest when they register.
            </p>
          </div>

          {/* Price breakdown — team fee (early-bird), any discount, then the
              $200 due today and the roster's remaining split. */}
          <div className="rounded-xl border border-ink/10 bg-paper p-4">
            <table className="w-full text-sm">
              <tbody>
                <tr>
                  <td className="py-0.5 text-ink-2">
                    Team fee
                    {season?.teamEarlyBirdActive && (
                      <span className="ml-2 rounded bg-ochre px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-wide text-ink align-middle">
                        Early-bird
                      </span>
                    )}
                  </td>
                  <td className="py-0.5 text-right tabular-nums">
                    {story?.baseTotal && (
                      <span className="mr-1.5 text-ink-muted line-through">{story.baseTotal}</span>
                    )}
                    {story ? story.total : baseFeeDollars != null ? `$${baseFeeDollars.toLocaleString()}` : "—"}
                  </td>
                </tr>
                {discount && (
                  <tr className="text-sage">
                    <td className="py-0.5">Discount · {discount.code}</td>
                    <td className="py-0.5 text-right tabular-nums">−${(discount.cents / 100).toLocaleString()}</td>
                  </tr>
                )}
                {discount && feeTotalDollars != null && (
                  <tr className="border-t border-ink/10">
                    <td className="pt-2 text-ink-2">Team total</td>
                    <td className="pt-2 text-right tabular-nums">${feeTotalDollars.toLocaleString()}</td>
                  </tr>
                )}
                <tr className={discount ? "" : "border-t border-ink/10"}>
                  <td className={`${discount ? "pt-1" : "pt-2"} font-semibold text-ink`}>Due today (deposit)</td>
                  <td className={`${discount ? "pt-1" : "pt-2"} text-right font-semibold tabular-nums text-primary-orange`}>
                    ${CAPTAIN_DEPOSIT_DOLLARS}
                  </td>
                </tr>
                {rosterRemainderDollars != null && (
                  <tr>
                    <td className="text-ink-muted text-xs">Your roster pays · split among teammates</td>
                    <td className="text-right text-ink-muted text-xs tabular-nums">${rosterRemainderDollars.toLocaleString()}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Discount code — collapsed until asked for, so it never competes
              with the pay action. Applying rewrites the team total above and
              the roster split; the $200 deposit is unchanged. */}
          {discount ? (
            <div className="flex items-center gap-2 rounded-xl border border-sage/40 bg-sage/10 px-4 py-3 text-sm">
              <span>
                Code <span className="font-mono font-semibold text-sage">{discount.code}</span> applied —
                team total −${(discount.cents / 100).toLocaleString()}
              </span>
              <button
                type="button"
                onClick={removeDiscount}
                disabled={discountBusy}
                className="ml-auto text-xs text-ink-muted underline disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          ) : discountOpen ? (
            <div className="rounded-xl border border-ink/10 bg-paper p-3">
              <div className="flex gap-2">
                <input
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyDiscount(); } }}
                  placeholder="Enter code"
                  autoFocus
                  className="flex-1 rounded-lg border border-ink/15 bg-paper px-3 py-2 text-sm font-mono uppercase tracking-wide focus:outline-none focus:border-primary-orange"
                />
                <button
                  type="button"
                  onClick={applyDiscount}
                  disabled={discountBusy || !discountInput.trim()}
                  className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-cream disabled:opacity-50"
                >
                  {discountBusy ? "…" : "Apply"}
                </button>
              </div>
              {discountError && <p className="mt-2 text-xs text-red-500">{discountError}</p>}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setDiscountOpen(true)}
              className="text-sm text-ink-2 underline underline-offset-2 hover:text-primary-orange"
            >
              Have a discount code?
            </button>
          )}
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
          onSuccess={async (paymentIntentId) => {
            // Best-effort bridge so the captain's own "Register myself"
            // click right after this doesn't beat the payment_intent.succeeded
            // webhook and get quoted full price (captain-credit.ts reads only
            // webhook-written state). The webhook remains the source of
            // truth — a failed/slow confirm here just means the credit stays
            // invisible for a few more seconds, not that it's lost.
            await confirmDeposit(paymentIntentId);
            setStatus("ok");
          }}
          onCancel={() => {
            // Back out of the deposit; the team row exists but is unpaid. Let
            // the captain retry by re-rendering the form.
            setStatus("idle");
            setDepositClientSecret(null);
            setDepositPublishableKey(null);
          }}
        />
        <p className="text-xs text-ink-muted leading-relaxed">
          Your card stays on file for the team — unpaid teammate shares are
          charged to it after the deadline.
        </p>
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
              <h3 className="font-display text-2xl text-ink mb-2">Your team is reserved.</h3>
              <p className="text-ink-2 leading-relaxed text-sm">
                You're up next — register yourself as a player below. Share your team link
                whenever you're ready; each teammate registers and pays their share, and
                you'll see them join your roster as they do.
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

        {/* Expected next step — every captain plays. */}
        <div className="bg-paper border-2 border-primary-orange/40 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <h4 className="font-display text-lg text-ink">Register yourself as a player</h4>
            <span className="ml-auto text-[10px] font-mono uppercase tracking-wide text-primary-orange border border-primary-orange/50 rounded-full px-2 py-0.5">
              Next step
            </span>
          </div>
          <p className="text-ink-muted text-sm mb-4 leading-relaxed">
            Sign your waiver and finish your own signup — captains play too. Your
            $200 deposit is already applied to your share.
          </p>
          <button
            type="button"
            onClick={() => inviteToken && onCaptainRegister(inviteToken)}
            className="inline-flex items-center gap-3 bg-primary-orange text-cream px-6 py-3 text-sm font-medium tracking-wide uppercase hover:bg-ink transition-colors"
            style={{ letterSpacing: "0.08em" }}
          >
            Register myself as a player →
          </button>
        </div>

        {/* Optional — invite the roster now or later from the team link. */}
        <div className="bg-paper border border-ink/10 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <h4 className="font-display text-lg text-ink">Invite your roster</h4>
            <span className="ml-auto text-[10px] font-mono uppercase tracking-wide text-ink-muted border border-ink/15 rounded-full px-2 py-0.5">
              Optional
            </span>
          </div>
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

        {inviteToken && <PaymentTracker inviteToken={inviteToken} />}
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
            autoCapitalize="words"
            enterKeyHint="next"
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
              autoComplete="name"
              autoCapitalize="words"
              enterKeyHint="next"
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
              autoComplete="email"
              inputMode="email"
              enterKeyHint="next"
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
            enterKeyHint="done"
            className="w-full px-3 py-2.5 bg-paper border border-ink/15 rounded-lg text-ink focus:outline-none focus:border-primary-orange transition-colors resize-y"
          />
        </label>

        {error && <p className="text-sm text-red-400">{error}</p>}

        {!isAuthed && (
          <div className="flex justify-start">
            <TurnstileWidget
              onToken={(t) => setTurnstileToken(t)}
              onError={() => setTurnstileToken("")}
            />
          </div>
        )}

        {story && (
          <div className="rounded-xl border border-primary-orange/25 bg-cream-2 px-4 py-3 text-sm">
            <div className="flex justify-between py-0.5">
              <span className="text-ink">Today — reserves your team</span>
              <span className="font-semibold text-ink">{story.deposit}</span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="text-ink">Season team fee</span>
              <span className="font-semibold text-ink">
                {story.total}
                {story.baseTotal && (
                  <span className="ml-1.5 line-through text-ink-faint font-normal text-xs">{story.baseTotal}</span>
                )}
              </span>
            </div>
            {rosterRemainderDollars != null && (
              <div className="flex justify-between py-0.5 text-ink-muted text-xs">
                <span>Your roster pays the rest when they register</span>
                <span>${rosterRemainderDollars.toLocaleString()}</span>
              </div>
            )}
            <p className="border-t border-primary-orange/20 mt-2 pt-2 text-xs text-ink-muted leading-relaxed">
              <span className="font-semibold text-ink">Your card stays on file for the team.</span>{" "}
              Teammate shares still unpaid after{deadlineLabel ? <> <b>{deadlineLabel}</b></> : " the payment deadline"} are
              charged to it. Your {story.deposit} counts toward the team fee.
            </p>
          </div>
        )}

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
            `Reserve your team · $${CAPTAIN_DEPOSIT_DOLLARS} →`
          )}
        </button>
        <p className="text-xs text-ink-muted leading-relaxed">
          By reserving, you agree to the payment terms above.
        </p>
        {!isAuthed && (
          <p className="text-xs text-ink-muted leading-relaxed">
            Creating your team also creates your account. If this email
            already has one, we'll send you a sign-in link instead.
          </p>
        )}
      </form>
    </div>
  );
}
