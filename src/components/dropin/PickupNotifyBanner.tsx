"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
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
      setError("Pick at least one way to be notified.");
      return;
    }
    if (wantSms && !phone.trim()) {
      setError("Enter a phone number for texts.");
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

  return (
    <section className="rounded-2xl border border-border bg-paper p-6">
      {phase === "done" ? (
        <div className="text-center space-y-2">
          <h3 className="font-display text-lg text-ink">You're on the list</h3>
          <p className="text-sm text-ink-muted">
            We'll reach out when a pickup game needs players. Manage anytime from{" "}
            <a href="/dashboard/play" className="underline">
              My Play
            </a>
            .
          </p>
          {emailAlsoPending && (
            <p className="text-sm text-ink-muted">And check your inbox to confirm email alerts.</p>
          )}
        </div>
      ) : phase === "pendingConfirm" ? (
        <div className="text-center space-y-2">
          <h3 className="font-display text-lg text-ink">Thanks — we'll be in touch</h3>
          <p className="text-sm text-ink-muted">We've got your request and will confirm shortly.</p>
        </div>
      ) : phase === "awaitingEmail" ? (
        <div className="text-center space-y-2">
          <h3 className="font-display text-lg text-ink">Check your inbox</h3>
          <p className="text-sm text-ink-muted">Click the link we emailed to confirm. That's the last step.</p>
        </div>
      ) : phase === "awaitingCode" ? (
        <div className="space-y-3">
          <h3 className="font-display text-lg text-ink">Enter the code we texted you</h3>
          {emailAlsoPending && (
            <p className="text-sm text-ink-muted">
              We also emailed you a link — click it to confirm email.
            </p>
          )}
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
          <label htmlFor={`${uid}-code`} className="block text-xs font-medium text-ink-muted">
            6-digit code
          </label>
          <input
            id={`${uid}-code`}
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="w-full px-3 py-2 rounded-md bg-paper border border-border text-sm text-ink"
            placeholder="123456"
          />
          <Button onClick={verifyCode} disabled={submitting || code.trim().length !== 6} className="w-full sm:w-auto">
            {submitting ? "Verifying…" : "Confirm"}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <h3 className="font-display text-lg text-ink">Get a text when a game needs players</h3>
            <p className="text-sm text-ink-muted mt-1">
              We'll only reach out when a session near you is short — never spam.
            </p>
          </div>
          {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${uid}-venue`} className="block text-xs font-medium text-ink-muted mb-1">
                Location
              </label>
              <select
                id={`${uid}-venue`}
                value={venueId}
                onChange={(e) => setVenueId(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-paper border border-border text-sm text-ink"
              >
                <option value="all">All locations</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={`${uid}-sport`} className="block text-xs font-medium text-ink-muted mb-1">
                Sport
              </label>
              <select
                id={`${uid}-sport`}
                value={sport}
                onChange={(e) => setSport(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-paper border border-border text-sm text-ink"
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

          {/* SMS (primary) — copy must stay character-identical to
              CONSENT_COPY.sms (src/lib/consents/marketing-channels.ts); a
              carrier reviewer compares the live form against stored
              consent evidence. */}
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={wantSms}
              onChange={(e) => setWantSms(e.target.checked)}
              className="mt-1"
            />
            <span className="text-sm text-ink">{CONSENT_COPY.sms}</span>
          </label>
          {wantSms && (
            <div>
              <label htmlFor={`${uid}-phone`} className="sr-only">
                Mobile number
              </label>
              <input
                id={`${uid}-phone`}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                inputMode="tel"
                autoComplete="tel"
                placeholder="Mobile number"
                className="w-full px-3 py-2 rounded-md bg-paper border border-border text-sm text-ink"
              />
            </div>
          )}

          {/* Email (optional) — copy must stay character-identical to
              CONSENT_COPY.email, same reason as above. */}
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={wantEmail}
              onChange={(e) => setWantEmail(e.target.checked)}
              className="mt-1"
            />
            <span className="text-sm text-ink">{CONSENT_COPY.email}</span>
          </label>
          {wantEmail && (
            <div>
              <label htmlFor={`${uid}-email`} className="sr-only">
                Email address
              </label>
              <input
                id={`${uid}-email`}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                inputMode="email"
                autoComplete="email"
                placeholder="Email address"
                className="w-full px-3 py-2 rounded-md bg-paper border border-border text-sm text-ink"
              />
            </div>
          )}

          {signedIn === false && (
            <TurnstileWidget
              ref={turnstileRef}
              onToken={(t) => {
                turnstileToken.current = t;
              }}
            />
          )}

          <Button onClick={submit} disabled={submitting} className="w-full sm:w-auto">
            {submitting ? "Signing you up…" : "Notify me"}
          </Button>
        </div>
      )}
    </section>
  );
}
