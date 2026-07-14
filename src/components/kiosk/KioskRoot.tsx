"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { ErrorBanner } from "@/components/ui/error-banner";
import SelfServe, { type SelfServeContext } from "@/components/self-serve/SelfServe";
import type { BrandId } from "@/lib/branding/themes";
import { FindBooking } from "./FindBooking";
import { WalkInWizard } from "./WalkInWizard";
import { IdleResetOverlay } from "./IdleResetOverlay";

type Mode = "landing" | "find" | "walkin" | "finish";

/** Idle seconds before we warn, on any screen holding personal details. */
const IDLE_WARN_AFTER_MS = 60_000;
/** Countdown shown in the warning before the hard reset. */
const IDLE_GRACE_SECONDS = 20;
/**
 * Hard ceiling on how long a child's "busy" signal may suppress the idle
 * timer. Suppression exists so a reset can't interrupt work the server has
 * already accepted — but a busy flag stuck true is strictly WORSE than the
 * reset it prevents: the kiosk would never reset again, and a customer's
 * name, DOB, and payment screen would sit on an unattended public iPad
 * indefinitely. So suppression is bounded, not trusted. SelfServe's webhook
 * poll gives up after 60s and every card releases its flag in a `finally`,
 * so 120s is a generous ceiling that nothing legitimate should reach; past
 * it we re-arm regardless of what the children claim.
 */
const BUSY_SUPPRESSION_MAX_MS = 120_000;

interface Props {
  locationSlug: string;
  locationName: string;
  brandName: string;
  publishableKey: string;
  brandId?: BrandId;
}

/**
 * The whole kiosk, as one island.
 *
 * The kiosk is a MOUNTED, UNATTENDED iPad in a public lobby. Its browser tab
 * must never leave /kiosk/<slug> — there is no back button a customer can be
 * trusted to press, and a stranded tab strands the device until staff notice.
 * So both entry paths (find-a-booking and walk-in) resolve a self-serve
 * *token*, and the shared SelfServe cards render INLINE here. Nothing in this
 * subtree calls window.location.
 */
export default function KioskRoot({
  locationSlug,
  locationName,
  brandName,
  publishableKey,
  brandId,
}: Props) {
  useHydrationBeacon();

  const [mode, setMode] = useState<Mode>("landing");
  const [token, setToken] = useState<string | null>(null);
  const [context, setContext] = useState<SelfServeContext | null>(null);
  const [loadingToken, setLoadingToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Bumping this remounts the whole interactive subtree, which is how a reset
  // destroys state rather than clearing it field by field. The next customer
  // must never see a trace of the last one.
  const [nonce, setNonce] = useState(0);
  // Idle-reset state. The countdown (in seconds) shown by IdleResetOverlay;
  // null means no warning is active.
  const [idleSeconds, setIdleSeconds] = useState<number | null>(null);
  const [online, setOnline] = useState(true);
  // Set by SelfServe whenever one of its cards has work in flight that a
  // reset would destroy: a confirmPayment/3-D Secure round-trip, the webhook
  // confirmation poll that follows it, a photo upload, or a waiver submit.
  // The idle timer must never wipe the screen inside those windows — the
  // write (or the charge) lands server-side regardless, and the customer is
  // left staring at the landing screen with no confirmation it happened.
  // SelfServe is the only thing that knows these windows exist, so it
  // reports them up rather than KioskRoot trying to infer them from `mode`.
  const [paymentBusy, setPaymentBusy] = useState(false);
  // Trips when paymentBusy has been continuously true past
  // BUSY_SUPPRESSION_MAX_MS — the backstop against a child that never
  // releases its flag. See the constant's comment.
  const [busySuppressionExpired, setBusySuppressionExpired] = useState(false);

  const reset = useCallback(() => {
    setToken(null);
    setContext(null);
    setError(null);
    setLoadingToken(false);
    setMode("landing");
    setPaymentBusy(false);
    setBusySuppressionExpired(false);
    setNonce((n) => n + 1);
    try {
      sessionStorage.clear();
    } catch {
      /* unavailable — nothing to clear */
    }
  }, []);

  // Armed on every screen that can hold personal details (find, walkin,
  // finish) — never on landing, which holds nothing and would otherwise show
  // a user-hostile countdown over an idle attract screen. Also disarmed
  // whenever a card reports work in flight, regardless of mode — unless that
  // suppression has run past its ceiling, in which case we re-arm anyway and
  // let the device recover rather than trust a possibly-stuck flag.
  const armed = mode !== "landing" && (!paymentBusy || busySuppressionExpired);

  // The suppression ceiling. Restarts on each fresh busy window (a decline
  // followed by a retry gets its own budget) and clears the moment the
  // children go quiet.
  useEffect(() => {
    if (!paymentBusy) {
      setBusySuppressionExpired(false);
      return;
    }
    const t = setTimeout(
      () => setBusySuppressionExpired(true),
      BUSY_SUPPRESSION_MAX_MS,
    );
    return () => clearTimeout(t);
  }, [paymentBusy]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  // Holds the CURRENT effect's arm() so activity reported from React (see
  // handleActivity below) re-arms through the exact same path as a real
  // pointerdown, rather than a second, drifting copy of the logic. Reset to
  // a no-op on teardown so a late call can't resurrect a dead timer.
  const armRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!armed) {
      setIdleSeconds(null);
      return;
    }
    let warnTimer: ReturnType<typeof setTimeout>;
    const arm = () => {
      clearTimeout(warnTimer);
      setIdleSeconds(null);
      warnTimer = setTimeout(() => setIdleSeconds(IDLE_GRACE_SECONDS), IDLE_WARN_AFTER_MS);
    };
    armRef.current = arm;
    const onActivity = () => arm();
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("keydown", onActivity);
    arm();
    return () => {
      clearTimeout(warnTimer);
      armRef.current = () => {};
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
    };
  }, [armed, nonce]);

  // Activity that window listeners CANNOT see. Stripe Elements renders its
  // card fields in a cross-origin iframe (as does an inline 3-D Secure
  // challenge): keystrokes inside it never bubble to this window, so a
  // customer painstakingly typing a 16-digit card number generates zero
  // detected activity and the idle timer counts them down to a reset —
  // mid-payment. PaymentElement's onChange/onFocus do fire in the parent
  // React tree, and SelfServe forwards them here. Stable identity so it
  // doesn't retrigger SelfServe's effects on every render.
  const handleActivity = useCallback(() => armRef.current(), []);

  // Countdown, then the hard reset.
  useEffect(() => {
    if (idleSeconds === null) return;
    if (idleSeconds <= 0) {
      reset();
      return;
    }
    const t = setTimeout(() => setIdleSeconds((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [idleSeconds, reset]);

  // Both entry paths converge here: a token is all the finish flow needs.
  const onToken = useCallback(async (t: string) => {
    setLoadingToken(true);
    setError(null);
    try {
      const res = await fetch(`/api/self-serve/${t}`);
      if (!res.ok) {
        setError(
          `Couldn't open your booking (${res.status}). Please see the front desk.`,
        );
        return;
      }
      // The API body IS the SelfServe context — including isMinor, which
      // decides guardian-vs-adult waiver language. Never reconstruct it here.
      setContext((await res.json()) as SelfServeContext);
      setToken(t);
      setMode("finish");
    } catch {
      setError("Couldn't reach the server. Please see the front desk.");
    } finally {
      setLoadingToken(false);
    }
  }, []);

  return (
    <div key={nonce} className="space-y-8">
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {!online && (
        <div className="rounded-xl border border-ochre/60 bg-ochre/10 px-5 py-4 text-sm text-ink">
          No internet connection. Please see the front desk — we can check you
          in by hand.
        </div>
      )}

      {idleSeconds !== null && (
        <IdleResetOverlay
          secondsLeft={idleSeconds}
          onStay={() => setIdleSeconds(null)}
        />
      )}

      {loadingToken && (
        <p className="text-sm text-ink-muted">Opening your booking…</p>
      )}

      {mode === "landing" && (
        <Landing
          locationName={locationName}
          brandName={brandName}
          onFind={() => setMode("find")}
          onWalkIn={() => setMode("walkin")}
        />
      )}

      {mode === "find" && (
        <FindBooking locationSlug={locationSlug} onToken={onToken} onBack={reset} />
      )}

      {mode === "walkin" && (
        <WalkInWizard locationSlug={locationSlug} onToken={onToken} onBack={reset} />
      )}

      {mode === "finish" && token && context && (
        <SelfServe
          token={token}
          context={context}
          publishableKey={publishableKey}
          brandId={brandId}
          onDone={reset}
          onBusyChange={setPaymentBusy}
          onActivity={handleActivity}
        />
      )}
    </div>
  );
}

function Landing({
  locationName,
  brandName,
  onFind,
  onWalkIn,
}: {
  locationName: string;
  brandName: string;
  onFind: () => void;
  onWalkIn: () => void;
}) {
  return (
    <div className="space-y-10">
      <header className="space-y-3">
        <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-primary">
          Welcome to {brandName}
        </p>
        <h1 className="font-display text-5xl md:text-6xl font-medium italic leading-[0.95] text-ink">
          {locationName}
        </h1>
        <div className="h-px bg-border w-16" />
        <p className="text-base text-ink-2 leading-relaxed max-w-md">
          Tap below to find your booking and finish anything you started — or register
          on the spot as a walk-in.
        </p>
      </header>

      <div className="space-y-3">
        <button
          type="button"
          onClick={onFind}
          className="group w-full min-h-[60px] px-6 py-7 rounded-xl bg-primary text-cream text-left transition-all hover:bg-primary/90 active:scale-[0.99] shadow-sm"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold tracking-[0.15em] uppercase text-cream/70 mb-1">
                Already booked
              </div>
              <div className="text-2xl font-medium">Find my booking</div>
            </div>
            <span
              aria-hidden="true"
              className="text-3xl text-cream/80 transition-transform group-hover:translate-x-1"
            >
              ›
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={onWalkIn}
          className="group w-full min-h-[60px] px-6 py-7 rounded-xl bg-paper border border-ink/80 text-ink text-left transition-all hover:bg-cream-2 active:scale-[0.99]"
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-xs font-semibold tracking-[0.15em] uppercase text-ink-muted mb-1">
                Just dropping in
              </div>
              <div className="text-2xl font-medium">Walk-in registration</div>
            </div>
            <span
              aria-hidden="true"
              className="text-3xl text-ink-faint transition-transform group-hover:translate-x-1"
            >
              ›
            </span>
          </div>
        </button>
      </div>

      <div className="pt-6 border-t border-border">
        <p className="text-xs text-ink-muted leading-relaxed">
          Need help? Ask the front desk — we can text or email a link to your phone
          instead.
        </p>
      </div>
    </div>
  );
}
