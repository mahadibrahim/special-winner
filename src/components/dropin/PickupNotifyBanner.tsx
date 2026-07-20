"use client";

import { useEffect, useId, useRef, useState } from "react";
import { BellRing, CheckCircle2, ArrowRight } from "lucide-react";
import { ErrorBanner } from "@/components/ui/error-banner";
import { toast } from "sonner";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/auth/turnstile-widget";
import { CONSENT_COPY } from "@/lib/consents/marketing-channels";

/**
 * Guest-friendly "text me when a game needs players" banner for the pickup
 * finder pages. Replaces the old account-gated capture card — anyone
 * can opt in here, signed in or not, via POST /api/dropin/notify.
 *
 * SMS is the primary channel (it's the one the fill-alert dispatcher
 * actually sends on); email is an optional "also keep me posted." Guests
 * pass a Turnstile token since this endpoint sends SMS/email
 * unauthenticated; signed-in users skip it (the endpoint only requires it
 * for !signedIn — see src/pages/api/dropin/notify.ts).
 *
 * States: idle -> (awaitingCode | awaitingEmail | pendingConfirm) -> done,
 * plus error.
 * - awaitingCode: SMS OTP needed (skipped if the number already has an
 *   opted_in row for this channel — see notify.ts's smsAlreadyOptedIn path).
 *   If email was also selected and is awaiting its own confirmation, the OTP
 *   screen and the post-OTP `done` screen both say so (emailAlsoPending).
 * - awaitingEmail: double opt-in email was sent; nothing more to do here.
 * - pendingConfirm: nothing is in flight to confirm (transaction rolled back,
 *   or a send failed) — a neutral "we've got your request" state. Never
 *   claims "we'll text you" on an unconfirmed capture.
 */

interface SessionLite {
  venueId: string | null;
  venueName: string | null;
  sportOrClassLabel: string;
}

interface NotifyResponse {
  ok: boolean;
  awaitingCode?: Array<"sms" | "email">;
  pending?: Array<"sms" | "email">;
  phoneVerificationId?: string;
  error?: string;
}

type Phase = "idle" | "awaitingCode" | "awaitingEmail" | "pendingConfirm" | "done";

function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

export function PickupNotifyBanner({ signedIn: signedInProp }: { signedIn?: boolean }) {
  useHydrationBeacon();
  const uid = useId();

  const [signedIn, setSignedIn] = useState<boolean | null>(signedInProp ?? null);
  const [venues, setVenues] = useState<Array<{ id: string; name: string }>>([]);
  const [sports, setSports] = useState<string[]>([]);

  const [venueId, setVenueId] = useState("all");
  const [sport, setSport] = useState("all");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  // Consent boxes MUST default unchecked — no pre-ticked marketing opt-in
  // (TCPA + Zernio SMS carrier review). The "Pick at least one way to be
  // notified" validation below handles the empty-selection case.
  const [wantSms, setWantSms] = useState(false);
  const [wantEmail, setWantEmail] = useState(false);

  const [phase, setPhase] = useState<Phase>("idle");
  const [verificationId, setVerificationId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the OTP phase is entered with email ALSO awaiting its own
  // double-opt-in click (awaitingCode includes both "sms" and "email") — so
  // the OTP screen and the post-OTP done screen can both say so honestly.
  const [emailAlsoPending, setEmailAlsoPending] = useState(false);

  const turnstileRef = useRef<TurnstileWidgetHandle>(null);
  const turnstileToken = useRef<string | null>(null);

  // Resolve signed-in state (prop, else probe /api/auth/me like Navigation does)
  useEffect(() => {
    if (signedInProp !== undefined) return;
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { user: null }))
      .then((d) => {
        if (cancelled) return;
        setSignedIn(Boolean(d.user));
        // Prefill the email we already have on the account (only email is on
        // /api/auth/me — no phone). Spares signed-in users retyping it.
        if (d.user?.email) setEmail(d.user.email);
      })
      .catch(() => {
        if (!cancelled) setSignedIn(false);
      });
    return () => {
      cancelled = true;
    };
  }, [signedInProp]);

  // Venue/sport option lists from the live schedule (same source as the finder)
  useEffect(() => {
    let cancelled = false;
    fetch("/api/dropin/sessions")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error())))
      .then((body: { sessions: SessionLite[] }) => {
        if (cancelled) return;
        const vmap = new Map<string, string>();
        const sset = new Set<string>();
        for (const s of body.sessions ?? []) {
          if (s.venueId && s.venueName) vmap.set(s.venueId, s.venueName);
          if (s.sportOrClassLabel) sset.add(s.sportOrClassLabel.toLowerCase());
        }
        setVenues(Array.from(vmap, ([id, name]) => ({ id, name })));
        setSports(Array.from(sset));
      })
      .catch(() => {
        // Silent — the form still works with "All locations" / "All sports".
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit() {
    setError(null);
    const channels: Array<"sms" | "email"> = [];
    if (wantSms) channels.push("sms");
    if (wantEmail) channels.push("email");
    if (channels.length === 0) {
      setError(
        phone.trim() || email.trim()
          ? "Check a box to confirm how we can reach you."
          : "Add a phone or email, then choose how you'd like to hear from us.",
      );
      return;
    }
    if (wantSms && !phone.trim()) {
      setError("Enter a mobile number to get texts.");
      return;
    }
    if (wantEmail && !email.trim()) {
      setError("Enter an email address.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/dropin/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channels,
          phone: wantSms ? phone.trim() : undefined,
          email: wantEmail ? email.trim() : undefined,
          venueId: venueId === "all" ? null : venueId,
          sport: sport === "all" ? null : sport,
          turnstileToken: turnstileToken.current ?? undefined,
        }),
      });
      const data = (await res.json()) as NotifyResponse;
      if (!res.ok) {
        setError(data.error ?? "Couldn't sign you up — try again.");
        return;
      }

      if (data.awaitingCode?.includes("sms") && data.phoneVerificationId) {
        setEmailAlsoPending(Boolean(data.awaitingCode?.includes("email")));
        setVerificationId(data.phoneVerificationId);
        setPhase("awaitingCode");
      } else if (data.awaitingCode?.includes("email")) {
        setPhase("awaitingEmail");
      } else if (data.pending?.length) {
        // Nothing is in flight to confirm (e.g. the transaction rolled back,
        // or a send failed and the channel came back under `pending`). We
        // captured the request but can't promise delivery — no "we'll text
        // you" toast here, that would over-promise on an unconfirmed capture.
        setPhase("pendingConfirm");
      } else {
        // Reached only when there's a genuine, already-confirmed success
        // (e.g. smsAlreadyOptedIn — the number already has an opted_in row).
        setPhase("done");
        toast.success(
          wantSms
            ? "You're set — we'll text you when a game needs players."
            : "You're set — we'll be in touch.",
        );
      }
    } catch {
      setError("Couldn't sign you up — try again.");
    } finally {
      setSubmitting(false);
      turnstileRef.current?.reset(); // tokens are single-use
    }
  }

  async function verifyCode() {
    if (!verificationId) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/phone-verify/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationId, code: code.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? "That code didn't work — try again.");
        return;
      }
      setPhase("done");
      toast.success(
        emailAlsoPending
          ? "You're on the list — we'll text you when a game needs players. Check your inbox to confirm email too."
          : "You're on the list — we'll text you when a game needs players.",
      );
    } catch {
      setError("Couldn't verify — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (signedIn === null) return null; // brief — avoids a flash while /api/auth/me resolves

  const inputClass =
    "w-full px-3.5 py-2.5 rounded-lg bg-paper border border-border text-sm text-ink placeholder:text-ink-faint focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors";
  const ctaClass =
    "w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg bg-ink text-cream text-sm font-semibold uppercase tracking-[0.06em] hover:bg-primary transition-colors disabled:opacity-60 disabled:pointer-events-none";
  const accent = { accentColor: "oklch(0.66 0.21 35)" } as const;

  return (
    <section className="rounded-2xl border border-border bg-paper overflow-hidden shadow-sm">
      {phase === "done" ? (
        <div className="p-8 text-center space-y-3">
          <span className="mx-auto grid place-items-center w-12 h-12 rounded-full bg-primary/10 text-primary">
            <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
          </span>
          <h3 className="font-display text-xl text-ink">You're on the list</h3>
          <p className="text-sm text-ink-muted">
            We'll reach out when a pickup game needs players. Manage anytime from{" "}
            <a href="/dashboard/play" className="text-primary underline underline-offset-2">
              My Play
            </a>
            .
          </p>
          {emailAlsoPending && (
            <p className="text-sm text-ink-muted">And check your inbox to confirm email alerts.</p>
          )}
        </div>
      ) : phase === "pendingConfirm" ? (
        <div className="p-8 text-center space-y-2">
          <h3 className="font-display text-xl text-ink">Thanks — we'll be in touch</h3>
          <p className="text-sm text-ink-muted">We've got your request and will confirm shortly.</p>
        </div>
      ) : phase === "awaitingEmail" ? (
        <div className="p-8 text-center space-y-2">
          <h3 className="font-display text-xl text-ink">Check your inbox</h3>
          <p className="text-sm text-ink-muted">Click the link we emailed to confirm. That's the last step.</p>
        </div>
      ) : phase === "awaitingCode" ? (
        <div className="p-6 sm:p-8 space-y-4 max-w-sm mx-auto">
          <div>
            <h3 className="font-display text-xl text-ink">Enter the code we texted you</h3>
            {emailAlsoPending && (
              <p className="text-sm text-ink-muted mt-1">
                We also emailed you a link — click it to confirm email.
              </p>
            )}
          </div>
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
          <div className="space-y-1.5">
            <label htmlFor={`${uid}-code`} className="block text-xs font-medium text-ink-muted">
              6-digit code
            </label>
            <input
              id={`${uid}-code`}
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={`${inputClass} text-center text-base tracking-[0.4em]`}
              placeholder="123456"
            />
          </div>
          <button
            type="button"
            onClick={verifyCode}
            disabled={submitting || code.trim().length !== 6}
            className={ctaClass}
          >
            {submitting ? "Verifying…" : "Confirm"}
          </button>
        </div>
      ) : (
        <>
          {/* Header band — the hook. A filled accent badge + a display
              headline that sells the moment, set on the cream tint so it
              reads as an invitation, not a settings form. */}
          <div className="bg-cream px-6 pt-6 pb-5 border-b border-border">
            <div className="flex items-start gap-3.5">
              <span className="flex-shrink-0 grid place-items-center w-11 h-11 rounded-full bg-primary text-cream">
                <BellRing className="w-5 h-5" aria-hidden="true" />
              </span>
              <div>
                <h3 className="font-display text-xl sm:text-2xl leading-[1.15] text-ink">
                  Get pinged when a game needs players
                </h3>
                <p className="text-sm text-ink-muted mt-1.5">
                  Short a player? We text the regulars so the run still happens — you could be on the field tonight.
                </p>
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="p-6 space-y-5">
            {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label htmlFor={`${uid}-venue`} className="block text-xs font-medium text-ink-muted">
                  Location
                </label>
                <select
                  id={`${uid}-venue`}
                  value={venueId}
                  onChange={(e) => setVenueId(e.target.value)}
                  className={inputClass}
                >
                  <option value="all">All locations</option>
                  {venues.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`${uid}-sport`} className="block text-xs font-medium text-ink-muted">
                  Sport
                </label>
                <select
                  id={`${uid}-sport`}
                  value={sport}
                  onChange={(e) => setSport(e.target.value)}
                  className={inputClass}
                >
                  <option value="all">All sports</option>
                  {sports.map((s) => (
                    <option key={s} value={s}>
                      {capitalize(s)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Phone + SMS consent (primary). Input is ALWAYS visible so the
                form is usable at a glance; the checkbox is the affirmative
                opt-in and stays unticked by default. Consent copy must stay
                character-identical to CONSENT_COPY.sms
                (src/lib/consents/marketing-channels.ts) — a carrier reviewer
                compares the live form against stored consent evidence. */}
            <div className="space-y-2">
              <label htmlFor={`${uid}-phone`} className="block text-xs font-medium text-ink-muted">
                Mobile number
              </label>
              <input
                id={`${uid}-phone`}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                autoComplete="tel"
                placeholder="(614) 555-0142"
                className={inputClass}
              />
              <label className="flex items-start gap-2.5 pt-0.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={wantSms}
                  onChange={(e) => setWantSms(e.target.checked)}
                  style={accent}
                  className="mt-0.5 h-4 w-4 flex-shrink-0"
                />
                <span className="text-xs text-ink-muted leading-relaxed">{CONSENT_COPY.sms}</span>
              </label>
            </div>

            {/* Email + consent (optional). Also always visible. Copy must stay
                character-identical to CONSENT_COPY.email, same reason. */}
            <div className="space-y-2">
              <label htmlFor={`${uid}-email`} className="block text-xs font-medium text-ink-muted">
                Email <span className="text-ink-faint font-normal">(optional)</span>
              </label>
              <input
                id={`${uid}-email`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                inputMode="email"
                autoComplete="email"
                placeholder="you@example.com"
                className={inputClass}
              />
              <label className="flex items-start gap-2.5 pt-0.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={wantEmail}
                  onChange={(e) => setWantEmail(e.target.checked)}
                  style={accent}
                  className="mt-0.5 h-4 w-4 flex-shrink-0"
                />
                <span className="text-xs text-ink-muted leading-relaxed">{CONSENT_COPY.email}</span>
              </label>
            </div>

            {signedIn === false && (
              <TurnstileWidget
                ref={turnstileRef}
                onToken={(t) => {
                  turnstileToken.current = t;
                }}
              />
            )}

            <button type="button" onClick={submit} disabled={submitting} className={ctaClass}>
              {submitting ? (
                "Signing you up…"
              ) : (
                <>
                  Notify me
                  <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </>
              )}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
