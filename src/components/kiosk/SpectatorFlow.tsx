"use client";

import { useEffect, useState } from "react";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import type { BrandId } from "@/lib/branding/themes";
import { spectatorWaiverText } from "@/lib/waivers/spectator-waiver-text";
import { type ConsentChannel } from "@/lib/consents/marketing-channels";
import { PhoneKeypad } from "./PhoneKeypad";
import { ConsentBoxes } from "./ConsentBoxes";

/**
 * The spectator flow — someone walking in to WATCH, not to play.
 *
 * lookup (already signed this year?) → found "you're all set", OR
 * form (who's watching) → sign (waiver text + signature + optional opt-in) →
 * done.
 *
 * The kiosk is a mounted, unattended iPad. Like the rest of this subtree it
 * never navigates the tab and holds no <a> — the flow ends by calling onBack,
 * which resets KioskRoot to the landing screen for the next person.
 *
 * THE DONE SCREEN TELLS THE TRUTH. The sign endpoint cannot subscribe anyone
 * (it's unauthenticated), so its response never means "subscribed". A channel
 * comes back in one of two buckets and the copy differs by which:
 *   awaitingCode — a confirmation is in flight and the customer has a NEXT STEP
 *     (enter the texted code here / click the email link).
 *   pending      — captured but no confirmation is possible yet (dormant
 *     channel); nothing for them to do but wait.
 * Never render either as "you're on the list". See sign.ts's response contract.
 */

type Step = "lookup" | "form" | "sign" | "done";

interface LookupResult {
  firstName: string;
  validUntil: string;
}

interface SignResult {
  awaitingCode: ConsentChannel[];
  pending: ConsentChannel[];
  phoneVerificationId?: string;
}

interface Props {
  locationSlug: string;
  organizationId: string;
  brandId?: BrandId;
  /** Returns to KioskRoot's landing screen, resetting all kiosk state. */
  onBack: () => void;
}

const INPUT_CLASS =
  "w-full px-4 py-3 bg-paper border border-border focus:border-ink focus:outline-none rounded-lg text-base text-ink placeholder:text-ink-faint transition-colors";

const PRIMARY_BTN =
  "w-full min-h-[60px] px-6 py-4 rounded-xl bg-primary text-cream text-lg font-medium transition-all hover:bg-primary/90 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed";

const GHOST_BTN =
  "inline-flex items-center gap-2 min-h-[44px] px-4 -ml-4 rounded-lg text-base text-ink-muted hover:text-ink transition-colors";

/** Minimum digits before we'll look up — same privacy floor as the booking
 *  search: fewer would let anyone at the kiosk fish for other people. */
const MIN_LOOKUP_DIGITS = 4;

/**
 * Must exactly match KIOSK_SPECTATOR_SOURCE in src/lib/consents/marketing.ts.
 * Kept as a literal here (not imported) because that module also exports
 * DB-backed helpers built on drizzle — importing it would pull server-only
 * code into this client bundle. A resent OTP's purposeContext.source has to
 * carry this exact string or /api/auth/phone-verify/check's
 * promotePendingPhoneConsents silently promotes nothing (source mismatch).
 */
const KIOSK_SPECTATOR_SOURCE = "kiosk_spectator";

/** Client-side floor between resend taps. The server independently rate-limits
 *  /api/auth/phone-verify/send to 1/phone/min — this just keeps a bored
 *  customer from hammering the button and racing that limit. */
const RESEND_COOLDOWN_SECONDS = 30;

const CHANNEL_LABEL: Record<ConsentChannel, string> = {
  email: "Email",
  sms: "Text messages",
  whatsapp: "WhatsApp",
};

/** What a customer must do (or wait for) per channel, per bucket. Honest by
 *  construction — see the component doc comment and sign.ts. */
const PENDING_COPY: Record<ConsentChannel, string> = {
  email: "We'll email you a confirmation link shortly.",
  sms: "We'll text you to confirm once our texting is switched on.",
  whatsapp: "We'll reach out on WhatsApp once it's available.",
};

function ageIsMinorHelp() {
  return "Signing for someone under 18? You'll sign as their parent or guardian.";
}

export function SpectatorFlow({ locationSlug, organizationId, brandId, onBack }: Props) {
  const [step, setStep] = useState<Step>("lookup");

  // --- lookup ---
  const [lookupDigits, setLookupDigits] = useState("");
  const [lookupResult, setLookupResult] = useState<LookupResult | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupSearched, setLookupSearched] = useState(false);

  // --- who's watching ---
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [isMinor, setIsMinor] = useState(false);
  const [guardianName, setGuardianName] = useState("");

  // --- signature + opt-in ---
  const [signedName, setSignedName] = useState("");
  const [consents, setConsents] = useState<ConsentChannel[]>([]);

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signResult, setSignResult] = useState<SignResult | null>(null);

  const waiverText = spectatorWaiverText(brandId);

  // Debounced lookup — same shape as FindBooking. Matches on phone digits only.
  useEffect(() => {
    if (lookupDigits.length < MIN_LOOKUP_DIGITS) {
      setLookupResult(null);
      setLookupSearched(false);
      return;
    }
    let alive = true;
    const t = setTimeout(async () => {
      setLookupLoading(true);
      try {
        const res = await fetch(
          `/api/kiosk/${locationSlug}/spectator/lookup?q=${encodeURIComponent(lookupDigits)}`,
        );
        const body = await res.json().catch(() => ({}));
        if (!alive) return;
        setLookupResult(
          body.found ? { firstName: body.firstName, validUntil: body.validUntil } : null,
        );
        setLookupSearched(true);
      } catch {
        if (alive) {
          setLookupResult(null);
          setLookupSearched(true);
        }
      } finally {
        if (alive) setLookupLoading(false);
      }
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [lookupDigits, locationSlug]);

  const goToForm = () => {
    // Carry whatever they already typed into the phone field — it's their number.
    setPhone((p) => p || lookupDigits);
    setError(null);
    setStep("form");
  };

  const submitForm = () => {
    if (!firstName.trim() || !lastName.trim()) {
      setError("Please enter a first and last name.");
      return;
    }
    if (phone.replace(/\D/g, "").length < 7) {
      setError("Please enter a valid phone number.");
      return;
    }
    if (isMinor && !guardianName.trim()) {
      setError("A parent or guardian name is required for a spectator under 18.");
      return;
    }
    setError(null);
    // Prefill the signature with the person who signs: the guardian for a
    // minor, otherwise the spectator themselves. They can edit it.
    setSignedName((s) => s || (isMinor ? guardianName : `${firstName} ${lastName}`.trim()));
    setStep("sign");
  };

  const submitSign = async () => {
    if (!signedName.trim()) {
      setError("Type a name to sign the waiver.");
      return;
    }
    // The server refuses a marketing opt-in without an email (no email → no
    // account to hang the consent off). Catch it here so a ticked box with no
    // address is a clear inline prompt, not a 422.
    if (consents.length > 0 && !email.trim()) {
      setError("Add your email above to receive our messages — or untick the boxes.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/kiosk/${locationSlug}/spectator/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          phone: phone.replace(/\D/g, ""),
          email: email.trim() || undefined,
          signedName: signedName.trim(),
          isMinor,
          guardianName: isMinor ? guardianName.trim() : undefined,
          consents,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? `Could not sign the waiver (${res.status}).`);
        setSubmitting(false);
        return;
      }
      setSignResult({
        awaitingCode: body.awaitingCode ?? [],
        pending: body.pending ?? [],
        phoneVerificationId: body.phoneVerificationId,
      });
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <button type="button" onClick={onBack} className={GHOST_BTN}>
        ← Back
      </button>

      <header className="space-y-3">
        <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-primary">
          Spectator check-in
        </p>
        <h1 className="font-display text-4xl md:text-5xl font-medium italic leading-[0.95] text-ink">
          {step === "lookup" && "Here to watch?"}
          {step === "form" && "Who's watching?"}
          {step === "sign" && "Sign the waiver"}
          {step === "done" && "You're all set"}
        </h1>
      </header>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {step === "lookup" && (
        <LookupStep
          digits={lookupDigits}
          onDigits={setLookupDigits}
          loading={lookupLoading}
          result={lookupResult}
          searched={lookupSearched}
          onNewWaiver={goToForm}
          onDone={onBack}
        />
      )}

      {step === "form" && (
        <FormStep
          firstName={firstName}
          setFirstName={setFirstName}
          lastName={lastName}
          setLastName={setLastName}
          phone={phone}
          setPhone={setPhone}
          email={email}
          setEmail={setEmail}
          isMinor={isMinor}
          setIsMinor={setIsMinor}
          guardianName={guardianName}
          setGuardianName={setGuardianName}
          onSubmit={submitForm}
        />
      )}

      {step === "sign" && (
        <SignStep
          waiverText={waiverText}
          isMinor={isMinor}
          signedName={signedName}
          setSignedName={setSignedName}
          email={email}
          setEmail={setEmail}
          consents={consents}
          setConsents={setConsents}
          submitting={submitting}
          onSubmit={submitSign}
        />
      )}

      {step === "done" && signResult && (
        <DoneStep
          firstName={firstName}
          result={signResult}
          phone={phone}
          organizationId={organizationId}
          onDone={onBack}
        />
      )}
    </div>
  );
}

// ============================================================================
// Step — lookup
// ============================================================================

function LookupStep({
  digits,
  onDigits,
  loading,
  result,
  searched,
  onNewWaiver,
  onDone,
}: {
  digits: string;
  onDigits: (v: string) => void;
  loading: boolean;
  result: LookupResult | null;
  searched: boolean;
  onNewWaiver: () => void;
  onDone: () => void;
}) {
  const notFound = searched && !loading && !result;

  if (result) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-sage/60 bg-sage/10 p-6">
          <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted mb-2">
            <span aria-hidden="true">✓</span> Already signed
          </p>
          <p className="font-display text-3xl italic text-ink">
            You're all set, {result.firstName}.
          </p>
          <p className="text-base text-ink-2 mt-2">
            Your spectator waiver is signed through{" "}
            {new Date(result.validUntil).toLocaleDateString([], {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
            . Enjoy the game.
          </p>
        </div>
        <button type="button" onClick={onDone} className={PRIMARY_BTN}>
          Done
        </button>
        <button type="button" onClick={onNewWaiver} className={`${GHOST_BTN} w-full justify-center`}>
          Not you? Sign a new waiver
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-base text-ink-2 leading-relaxed">
        Enter your phone number to check if you've already signed this year.
      </p>
      <div
        aria-live="polite"
        className="min-h-[64px] flex items-center justify-center rounded-xl border border-border bg-paper px-5 py-3"
      >
        {digits ? (
          <span className="font-display text-4xl font-medium tracking-wide text-ink">
            {digits}
          </span>
        ) : (
          <span className="font-display text-4xl italic text-ink-faint">Your phone</span>
        )}
      </div>
      <PhoneKeypad value={digits} onChange={onDigits} />

      {loading && <LoadingSkeleton />}

      {notFound && (
        <div className="rounded-xl border border-border bg-paper p-5">
          <p className="text-base font-medium text-ink mb-1">No waiver on file yet.</p>
          <p className="text-sm text-ink-muted">Let's sign one — it only takes a moment.</p>
        </div>
      )}

      <button type="button" onClick={onNewWaiver} className={PRIMARY_BTN}>
        Sign the spectator waiver
      </button>
    </div>
  );
}

// ============================================================================
// Step — who's watching
// ============================================================================

function FormStep({
  firstName,
  setFirstName,
  lastName,
  setLastName,
  phone,
  setPhone,
  email,
  setEmail,
  isMinor,
  setIsMinor,
  guardianName,
  setGuardianName,
  onSubmit,
}: {
  firstName: string;
  setFirstName: (v: string) => void;
  lastName: string;
  setLastName: (v: string) => void;
  phone: string;
  setPhone: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  isMinor: boolean;
  setIsMinor: (v: boolean) => void;
  guardianName: string;
  setGuardianName: (v: string) => void;
  onSubmit: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-4"
    >
      <p className="text-sm text-ink-muted">
        {isMinor
          ? "Tell us who's watching. The waiver is signed by their parent or guardian."
          : "Tell us who's watching. We'll use this for your spectator waiver."}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <input
          required
          placeholder={isMinor ? "Spectator first name" : "First name"}
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          className={INPUT_CLASS}
        />
        <input
          required
          placeholder={isMinor ? "Spectator last name" : "Last name"}
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className={INPUT_CLASS}
        />
      </div>
      <input
        required
        type="tel"
        placeholder="Phone"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className={INPUT_CLASS}
      />
      <input
        type="email"
        placeholder="Email (optional)"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={INPUT_CLASS}
      />

      <label className="flex items-start gap-3 min-h-[44px] p-4 rounded-xl border border-border bg-paper cursor-pointer hover:bg-cream-2 transition-colors">
        <input
          type="checkbox"
          checked={isMinor}
          onChange={(e) => setIsMinor(e.target.checked)}
          className="mt-1 w-5 h-5 accent-primary"
        />
        <span className="text-base text-ink leading-relaxed">
          This spectator is under 18.
          <span className="block text-sm text-ink-muted">{ageIsMinorHelp()}</span>
        </span>
      </label>

      {isMinor && (
        <div className="space-y-1.5">
          <label className="block text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted px-1">
            Parent or guardian name
          </label>
          <input
            required
            placeholder="Parent or guardian full name"
            value={guardianName}
            onChange={(e) => setGuardianName(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>
      )}

      <button type="submit" className={PRIMARY_BTN}>
        Continue to the waiver
      </button>
    </form>
  );
}

// ============================================================================
// Step — waiver + signature + opt-in
// ============================================================================

function SignStep({
  waiverText,
  isMinor,
  signedName,
  setSignedName,
  email,
  setEmail,
  consents,
  setConsents,
  submitting,
  onSubmit,
}: {
  waiverText: string;
  isMinor: boolean;
  signedName: string;
  setSignedName: (v: string) => void;
  email: string;
  setEmail: (v: string) => void;
  consents: ConsentChannel[];
  setConsents: (v: ConsentChannel[]) => void;
  submitting: boolean;
  onSubmit: () => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="space-y-6"
    >
      <div className="rounded-xl border border-border bg-cream-2 p-5 max-h-64 overflow-y-auto">
        <p className="text-base text-ink leading-relaxed">{waiverText}</p>
      </div>

      <div className="space-y-1.5">
        <label className="block text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted px-1">
          {isMinor ? "Parent or guardian — type your name to sign" : "Type your name to sign"}
        </label>
        <input
          required
          placeholder="Full name"
          value={signedName}
          onChange={(e) => setSignedName(e.target.value)}
          className={INPUT_CLASS}
        />
      </div>

      <div className="pt-4 border-t border-border space-y-3">
        <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted px-1">
          Stay in the loop
        </p>
        <ConsentBoxes selected={consents} onChange={setConsents} />
        {consents.length > 0 && !email.trim() && (
          <div className="space-y-1.5">
            <label className="block text-sm text-ink-muted px-1">
              Add your email so we can reach you.
            </label>
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>
        )}
      </div>

      <button type="submit" disabled={submitting} className={PRIMARY_BTN}>
        {submitting ? "Signing…" : "Sign & finish"}
      </button>
    </form>
  );
}

// ============================================================================
// Step — done (honest about awaitingCode vs pending)
// ============================================================================

function DoneStep({
  firstName,
  result,
  phone,
  organizationId,
  onDone,
}: {
  firstName: string;
  result: SignResult;
  phone: string;
  organizationId: string;
  onDone: () => void;
}) {
  const phoneAwaiting = result.awaitingCode.filter((c) => c !== "email");
  const emailAwaiting = result.awaitingCode.includes("email");
  const hasFollowUp =
    result.awaitingCode.length > 0 || result.pending.length > 0;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-sage/60 bg-sage/10 p-6">
        <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted mb-2">
          <span aria-hidden="true">✓</span> Waiver signed
        </p>
        <p className="font-display text-3xl italic text-ink">
          You're all set{firstName ? `, ${firstName}` : ""} — enjoy the game.
        </p>
      </div>

      {hasFollowUp && (
        <div className="space-y-3">
          {/* awaitingCode: a confirmation is IN FLIGHT and the customer has a
              next step. NEVER phrased as "subscribed". */}
          {emailAwaiting && (
            <div className="rounded-xl border border-ochre/60 bg-ochre/10 p-5">
              <p className="text-base font-medium text-ink mb-1">
                One more step for {CHANNEL_LABEL.email.toLowerCase()}
              </p>
              <p className="text-sm text-ink-2">
                Check your email and tap the link to confirm you'd like our
                messages. You're not on the list until you do.
              </p>
            </div>
          )}

          {phoneAwaiting.length > 0 && result.phoneVerificationId && (
            <OtpConfirm
              channels={phoneAwaiting}
              verificationId={result.phoneVerificationId}
              phone={phone}
              organizationId={organizationId}
            />
          )}

          {/* pending: captured, but no confirmation is possible yet. Nothing
              for the customer to do — tell them it's coming. */}
          {result.pending.map((c) => (
            <div
              key={c}
              className="rounded-xl border border-border bg-paper p-5"
            >
              <p className="text-base font-medium text-ink mb-1">
                {CHANNEL_LABEL[c]}
              </p>
              <p className="text-sm text-ink-2">{PENDING_COPY[c]}</p>
            </div>
          ))}
        </div>
      )}

      <button type="button" onClick={onDone} className={PRIMARY_BTN}>
        Done
      </button>
    </div>
  );
}

/**
 * The verified act for the phone channels: the customer enters the code we
 * texted, which promotes their `pending` intent to real consent (see
 * /api/auth/phone-verify/check → promotePendingPhoneConsents). One code covers
 * both sms and whatsapp — the endpoint promotes every pending kiosk row for the
 * number. Until the code is entered they are NOT subscribed, so this never
 * claims otherwise.
 */
function OtpConfirm({
  channels,
  verificationId,
  phone,
  organizationId,
}: {
  channels: ConsentChannel[];
  verificationId: string;
  /** The number the original code was texted to — a resend goes to the same
   *  number, never a re-typed one (this screen has no phone field). */
  phone: string;
  organizationId: string;
}) {
  // Not a prop past the first render: a successful resend swaps this in for
  // the id of the fresh verification row, entirely inside this component.
  const [currentVerificationId, setCurrentVerificationId] = useState(verificationId);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [justResent, setJustResent] = useState(false);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendCooldown]);

  const channelNames = channels.map((c) => CHANNEL_LABEL[c].toLowerCase()).join(" and ");

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/phone-verify/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationId: currentVerificationId, code }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "That code didn't work. Please try again.");
        setBusy(false);
        return;
      }
      setConfirmed(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  // Send a fresh code to the same number. This re-drives the dedicated
  // phone-verify endpoint — NOT the spectator sign endpoint — so it cannot
  // create a second waiver or a second set of consent rows. The
  // purposeContext below must match what sign.ts wrote for the original code
  // (source + organizationId): that's what lets a code entered against THIS
  // fresh verification still promote the pending kiosk consent rows for this
  // phone (see promotePendingPhoneConsents in lib/consents/marketing.ts).
  const resend = async () => {
    setResending(true);
    setError(null);
    setJustResent(false);
    try {
      const res = await fetch("/api/auth/phone-verify/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone,
          organizationId,
          purpose: "registration",
          purposeContext: { source: KIOSK_SPECTATOR_SOURCE, organizationId },
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Don't surface body.error verbatim here — /send's non-429 failure
        // reasons ("Organization context required", "Organization mismatch")
        // are internal tenant-binding diagnostics, not something a kiosk
        // customer should read. Keep the message generic and actionable.
        setError(
          res.status === 429
            ? "Give it a moment before requesting another code."
            : "Could not send a new code. Please try again.",
        );
        setResendCooldown(
          typeof body.retryAfter === "number" ? body.retryAfter : RESEND_COOLDOWN_SECONDS,
        );
        return;
      }
      setCurrentVerificationId(body.verificationId);
      setCode("");
      setJustResent(true);
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setResending(false);
    }
  };

  if (confirmed) {
    return (
      <div className="rounded-xl border border-sage/60 bg-sage/10 p-5">
        <p className="text-base font-medium text-ink mb-1">
          <span aria-hidden="true">✓</span> Confirmed
        </p>
        <p className="text-sm text-ink-2">
          You'll start hearing from us on {channelNames}.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-ochre/60 bg-ochre/10 p-5 space-y-4">
      <div>
        <p className="text-base font-medium text-ink mb-1">
          Confirm {channelNames}
        </p>
        <p className="text-sm text-ink-2">
          {justResent
            ? "We just texted a new code to your phone. Enter it to confirm — you're not on the list until you do."
            : "We texted a 6-digit code to your phone. Enter it to confirm — you're not on the list until you do."}
        </p>
      </div>
      <div
        aria-live="polite"
        className="min-h-[56px] flex items-center justify-center rounded-lg border border-border bg-paper px-4 py-2"
      >
        {code ? (
          <span className="font-display text-3xl font-medium tracking-[0.3em] text-ink">
            {code}
          </span>
        ) : (
          <span className="font-display text-2xl italic text-ink-faint">6-digit code</span>
        )}
      </div>
      <PhoneKeypad value={code} onChange={setCode} maxLength={6} />
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}
      <button
        type="button"
        onClick={verify}
        disabled={busy || code.length !== 6}
        className={PRIMARY_BTN}
      >
        {busy ? "Confirming…" : "Confirm"}
      </button>
      <button
        type="button"
        onClick={resend}
        disabled={resending || resendCooldown > 0}
        className={`${GHOST_BTN} w-full justify-center`}
      >
        {resending
          ? "Sending…"
          : resendCooldown > 0
            ? `Send a new code (${resendCooldown}s)`
            : "Didn't get it? Send a new code"}
      </button>
    </div>
  );
}
