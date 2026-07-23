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
  const [sendingLink, setSendingLink] = useState(false);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Captain $200 deposit (saves a card for the post-deadline backstop charge).
  // Set by `prepare`; nothing (account/team) exists until this deposit succeeds.
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);

  // Guest email gate: does this email already have an account? null = unchecked.
  // Existing → sign-in first (before the rest of the form); new → deferred flow.
  const [emailExists, setEmailExists] = useState<boolean | null>(isAuthed ? false : null);
  const [checkingEmail, setCheckingEmail] = useState(false);

  // Snapshot of the (discounted) team fee, returned by prepare/finalize and used
  // to default the per-teammate even split of (teamFee − $200 captain deposit).
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
    if (status === "ok") trackTeamHqViewed({ seasonId });
    else if (status === "idle") trackTeamCreateViewed({ seasonId });
  }, [status, seasonId]);
  // "Deposit viewed" fires when the payment element is revealed (post-prepare).
  useEffect(() => {
    if (clientSecret) trackTeamDepositViewed({ seasonId });
  }, [clientSecret, seasonId]);

  // Mirror the flow step + applied discount up to the context rail. Details +
  // payment now share one screen, so the team flow is 3 steps: Reserve (1) →
  // Register yourself (2, the HQ screen) → Invite roster (3, optional).
  useEffect(() => {
    onStepChange?.(status === "ok" ? 2 : 1);
  }, [status, onStepChange]);
  useEffect(() => {
    onDiscountChange?.(discount?.cents ?? null);
  }, [discount, onDiscountChange]);

  // Validate a discount code against the season (no team exists yet — it's
  // created at finalize). Client-side validation is for immediate feedback and
  // the breakdown; `prepare` re-validates + applies it authoritatively. The
  // deposit is always $200, so the code can take at most (fee − $200) off.
  const applyDiscount = async () => {
    const code = discountInput.trim();
    if (!code) return;
    const feeDollars = season ? (season.effectiveTeamPrice ?? season.teamPrice ?? season.price) : null;
    if (feeDollars == null) return;
    const feeCents = Math.round(feeDollars * 100);
    const maxOffCents = feeCents - CAPTAIN_DEPOSIT_CENTS;
    setDiscountBusy(true);
    setDiscountError(null);
    try {
      const res = await fetch("/api/public/validate-discount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, seasonId, purchaseAmountCents: feeCents }),
      });
      const json = await res.json();
      if (!res.ok || !json.valid) {
        setDiscountError(json.error ?? "That code isn't valid for this league.");
        return;
      }
      const cents: number = json.calculatedDiscount?.discountAmountCents ?? 0;
      if (cents > maxOffCents) {
        setDiscountError(
          `A $${CAPTAIN_DEPOSIT_DOLLARS} deposit is always due today, so a code can take at most $${(maxOffCents / 100).toLocaleString()} off this team. This one's larger than that.`,
        );
        return;
      }
      setDiscount({ code: json.discount?.code ?? code.toUpperCase(), cents });
      setDiscountInput("");
      setDiscountOpen(false);
    } catch {
      setDiscountError("Couldn't check that code. Please try again.");
    } finally {
      setDiscountBusy(false);
    }
  };

  // No team to mutate pre-payment — just clear local state.
  const removeDiscount = () => {
    setDiscount(null);
    setDiscountError(null);
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

  // Guest email gate: is this email already an account? Existing → sign-in
  // first (the render shows the gate); new → the deferred reserve continues.
  const checkEmail = async () => {
    if (isAuthed) return;
    const email = captainEmail.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setEmailExists(null);
      return;
    }
    setCheckingEmail(true);
    try {
      const r = await fetch(`/api/auth/check-email?email=${encodeURIComponent(email)}`);
      setEmailExists(r.ok ? (await r.json()).exists === true : false);
    } catch {
      setEmailExists(false); // fail open — prepare re-checks server-side anyway
    } finally {
      setCheckingEmail(false);
    }
  };

  const formReady =
    teamName.trim().length > 0 &&
    captainName.trim().length > 0 &&
    captainEmail.trim().length > 0 &&
    (isAuthed || emailExists === false);

  /**
   * Prepare the $200 deposit WITHOUT creating an account or team. On success
   * the payment element reveals inline (same page). A guest whose email turns
   * out to have an account is bounced to the magic-link sign-in.
   */
  const prepareDeposit = async () => {
    if (!formReady || preparing) return;
    setPreparing(true);
    setError(null);
    trackTeamCreateSubmitted({ seasonId, authed: isAuthed });
    try {
      const res = await fetch("/api/public/team-registrations/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          seasonId,
          teamName: teamName.trim(),
          captainName: captainName.trim(),
          captainEmail: captainEmail.trim(),
          notes: notes.trim() || undefined,
          backstopConsent: true,
          discountCode: discount?.code,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409 && json.needsSignIn) {
        setEmailExists(true); // render the sign-in gate
        return;
      }
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "We couldn't start your reservation. Please try again.");
      }
      if (typeof json.teamFeeCents === "number") setTeamFeeCents(json.teamFeeCents);
      setPublishableKey(json.publishableKey);
      setClientSecret(json.clientSecret);
    } catch (err) {
      setError(err instanceof Error ? err.message : "We couldn't start your reservation.");
    } finally {
      setPreparing(false);
    }
  };

  /**
   * The deposit succeeded — create the account + team (server-side, verified
   * against Stripe) and advance to the team HQ. The webhook backstop does the
   * same team creation if this call ever fails, so a slow/failed finalize never
   * loses a paid captain their team; it just means they sign in to find it.
   */
  const finalize = async (paymentIntentId: string): Promise<void> => {
    try {
      const res = await fetch("/api/public/team-registrations/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentIntentId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? "We couldn't finish setting up your team.");
      }
      clearDraft();
      setInviteToken(json.inviteToken);
      if (teamFeeCents != null) {
        const splittable = Math.max(0, teamFeeCents - CAPTAIN_DEPOSIT_CENTS);
        const [a, b] = evenSplitCents(splittable, 2);
        setInviteRows([
          { email: "", amount: ((a ?? 0) / 100).toFixed(2) },
          { email: "", amount: ((b ?? 0) / 100).toFixed(2) },
        ]);
      }
      setJoinUrl(
        `${window.location.origin}/register/${seasonId}?team=${encodeURIComponent(json.inviteToken)}`,
      );
      setStatus("ok");
    } catch (err) {
      // The deposit is safe and the webhook backstop will create the team —
      // surface a recoverable message rather than losing the captain.
      setError(
        err instanceof Error
          ? `${err.message} Your $${CAPTAIN_DEPOSIT_DOLLARS} deposit went through — refresh or check your email for your team link.`
          : "Your deposit went through — check your email for your team link.",
      );
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

  if (status === "ok" && joinUrl) {
    return (
      <div className="space-y-6">
        <div className="bg-cream-2 border border-primary-orange/30 rounded-2xl p-6">
          <div className="flex items-start gap-4 mb-6">
            <CheckCircle2 className="w-6 h-6 text-primary-orange flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-display text-2xl text-ink mb-2">You're in — team reserved.</h3>
              <p className="text-ink-2 leading-relaxed text-sm">
                You're on the roster as captain (your $200 deposit covers your spot). Share your
                team link whenever you're ready; each teammate registers and pays their share, and
                you'll see them join as they do. We'll email you a waiver link to sign before game 1.
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

        {/* Optional — invite the roster now or later from the team link. The
            captain is already on the roster (auto-registered at deposit). */}
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

  const labelClass = "text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted block mb-2";
  const inputClass =
    "w-full px-3 py-2.5 bg-paper border border-ink/15 rounded-lg text-ink placeholder:text-ink-faint focus:outline-none focus:border-primary-orange transition-colors disabled:opacity-60";
  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(captainEmail.trim());

  // Price breakdown — shown in both the form and the payment view.
  const breakdown = (
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
              {story?.baseTotal && <span className="mr-1.5 text-ink-muted line-through">{story.baseTotal}</span>}
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
  );

  const discountUi = discount ? (
    <div className="flex items-center gap-2 rounded-xl border border-sage/40 bg-sage/10 px-4 py-3 text-sm">
      <span>
        Code <span className="font-mono font-semibold text-sage">{discount.code}</span> applied —
        team total −${(discount.cents / 100).toLocaleString()}
      </span>
      <button type="button" onClick={removeDiscount} className="ml-auto text-xs text-ink-muted underline">Remove</button>
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
  );

  const handleSendSignIn = async () => {
    setSendingLink(true);
    setError(null);
    try {
      await requestMagicLink();
      setLinkSentReason("account_exists");
      setStatus("link_sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send your sign-in link");
    } finally {
      setSendingLink(false);
    }
  };

  // ── One page: identity → (sign-in gate | form) → inline payment ───────────
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted">Step 1 of 2 · Required</p>
        <h1 className="font-display text-2xl text-ink mt-1 mb-2">Reserve your team</h1>
        <p className="text-ink-2 text-sm leading-relaxed">
          <b>${CAPTAIN_DEPOSIT_DOLLARS}</b> reserves your team today. Your roster splits the rest when they register.
        </p>
      </div>

      <label className="block">
        <span className={labelClass}>Your email <span className="text-primary-orange">*</span></span>
        <input
          type="email"
          value={captainEmail}
          onChange={(e) => { setCaptainEmail(e.target.value); if (!isAuthed) setEmailExists(null); }}
          onBlur={() => { if (!isAuthed && emailExists === null) checkEmail(); }}
          disabled={isAuthed || clientSecret != null}
          maxLength={320}
          autoComplete="email"
          inputMode="email"
          placeholder="you@example.com"
          className={inputClass}
        />
        {!isAuthed && emailExists === false && !clientSecret && (
          <span className="mt-1.5 block text-xs text-sage">
            ✓ New here — we'll set up your team account when your deposit goes through.
          </span>
        )}
      </label>

      {!isAuthed && emailExists === true ? (
        /* Existing account → sign in before the rest of the form. */
        <div className="rounded-xl border border-ochre/50 bg-ochre/10 p-4 space-y-3">
          <h3 className="font-display text-lg text-ink">You already have an account</h3>
          <p className="text-ink-2 text-sm">Sign in to keep your teams and registrations together — no password needed.</p>
          <div className="flex justify-start">
            <TurnstileWidget onToken={(t) => setTurnstileToken(t)} onError={() => setTurnstileToken("")} />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="button"
            onClick={handleSendSignIn}
            disabled={sendingLink}
            className="inline-flex items-center gap-2 bg-ink text-cream rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
          >
            {sendingLink ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
            Email me a sign-in link
          </button>
          <button
            type="button"
            onClick={() => setEmailExists(null)}
            className="block text-xs text-ink-muted underline"
          >
            wrong email? edit it
          </button>
        </div>
      ) : !isAuthed && emailExists === null ? (
        /* Guest hasn't confirmed the email yet — email-first gate. */
        <div className="space-y-2">
          {error && <p className="text-sm text-red-500">{error}</p>}
          <button
            type="button"
            onClick={checkEmail}
            disabled={!validEmail || checkingEmail}
            className="inline-flex items-center gap-2 bg-ink text-cream rounded-lg px-5 py-2.5 text-sm font-semibold disabled:opacity-50"
          >
            {checkingEmail ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Continue →
          </button>
        </div>
      ) : clientSecret && publishableKey ? (
        /* Payment revealed inline — details locked with an edit affordance. */
        <>
          <div className="flex items-center justify-between rounded-xl border border-ink/10 bg-cream-2 px-4 py-3 text-sm">
            <span className="text-ink font-semibold">{teamName.trim() || "Your team"}</span>
            <button
              type="button"
              onClick={() => { setClientSecret(null); setPublishableKey(null); }}
              className="text-xs text-ink-muted underline"
            >
              Edit details
            </button>
          </div>
          {breakdown}
          <EmbeddedPayment
            clientSecret={clientSecret}
            publishableKey={publishableKey}
            seasonItem={{ id: seasonId, name: teamName.trim() || "Team deposit", category: "Team", category2: "Team", priceCents: CAPTAIN_DEPOSIT_CENTS }}
            valueCents={CAPTAIN_DEPOSIT_CENTS}
            paymentType="deposit"
            returnUrl={`${typeof window !== "undefined" ? window.location.origin : ""}/register/${seasonId}?mode=team`}
            onSuccess={finalize}
            onCancel={() => { setClientSecret(null); setPublishableKey(null); }}
          />
          {error && <p className="text-sm text-red-500">{error}</p>}
          <p className="text-xs text-ink-muted leading-relaxed">
            Your account and team are created when this deposit succeeds — nothing before. Your card stays on file for
            the team; unpaid teammate shares are charged to it after the deadline.
          </p>
        </>
      ) : (
        /* Reserve form (authed, or guest with a new email). */
        <>
          <label className="block">
            <span className={labelClass}>Team name <span className="text-primary-orange">*</span></span>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              maxLength={200}
              placeholder="e.g. The Last Pick, FC Worthington, Friday Crew"
              autoCapitalize="words"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Your name <span className="text-primary-orange">*</span></span>
            <input
              type="text"
              value={captainName}
              onChange={(e) => setCaptainName(e.target.value)}
              maxLength={200}
              autoComplete="name"
              autoCapitalize="words"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Anything we should know? (optional)</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder="Returning team, schedule preferences, etc."
              className={`${inputClass} resize-y`}
            />
          </label>

          {breakdown}
          {discountUi}
          <p className="text-xs text-ink-muted leading-relaxed">
            Reserving keeps your card on file for the team — any teammate shares still unpaid after
            {deadlineLabel ? <> <b>{deadlineLabel}</b></> : " the deadline"} are charged to it. Your
            ${CAPTAIN_DEPOSIT_DOLLARS} deposit counts toward the team fee, and you're added to the roster as captain.
          </p>
          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            type="button"
            onClick={prepareDeposit}
            disabled={!formReady || preparing}
            className="inline-flex items-center justify-center gap-2 w-full px-7 py-3.5 bg-primary-orange text-cream text-sm font-semibold tracking-wide uppercase hover:bg-ink transition-colors disabled:opacity-50"
            style={{ letterSpacing: "0.06em" }}
          >
            {preparing ? <><Loader2 className="w-4 h-4 animate-spin" /> Setting up payment…</> : "Continue to payment →"}
          </button>
        </>
      )}
    </div>
  );
}
