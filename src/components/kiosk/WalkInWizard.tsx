"use client";

import { useEffect, useRef, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type { Stripe as StripeJs } from "@stripe/stripe-js";
import { Camera, ImageIcon, RotateCcw } from "lucide-react";

interface Session {
  id: string;
  startsAt: string;
  endsAt: string;
  title: string;
  spaceName: string;
  format: string | null;
  capacity: number;
  booked: number;
  available: number;
  sessionRateCents: number | null;
}

interface Contact {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
}

interface Parent {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

type Step = "session" | "contact" | "waiver" | "photo" | "payment" | "done";

const STEPS: Step[] = ["session", "contact", "waiver", "photo", "payment"];
const STEP_LABEL: Record<Step, string> = {
  session: "Pick a session",
  contact: "Your details",
  waiver: "Liability waiver",
  photo: "Profile photo",
  payment: "Payment",
  done: "All set",
};

function ageFromDob(dob: string): number {
  if (!dob) return 99;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return 99;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) age--;
  return age;
}

const stripePromiseCache = new Map<string, Promise<StripeJs | null>>();
function getStripePromise(publishableKey: string): Promise<StripeJs | null> {
  let p = stripePromiseCache.get(publishableKey);
  if (!p) {
    p = loadStripe(publishableKey);
    stripePromiseCache.set(publishableKey, p);
  }
  return p;
}

interface Props {
  locationSlug: string;
  locationName: string;
  publishableKey: string;
  onBack: () => void;
}

const INPUT_CLASS =
  "w-full px-4 py-3 bg-paper border border-border focus:border-ink focus:outline-none rounded-lg text-base text-ink placeholder:text-ink-faint transition-colors";

const PRIMARY_BTN =
  "w-full px-6 py-4 rounded-xl bg-primary text-cream text-lg font-medium transition-all hover:bg-primary/90 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed";

const GHOST_BTN =
  "text-sm text-ink-muted hover:text-ink transition-colors";

export function WalkInWizard({ locationSlug, locationName, publishableKey, onBack }: Props) {
  const [step, setStep] = useState<Step>("session");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsError, setSessionsError] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [contact, setContact] = useState<Contact>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    dob: "",
  });
  const [parent, setParent] = useState<Parent>({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
  });
  const [token, setToken] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [paymentAmounts, setPaymentAmounts] = useState<{
    baseAmountCents: number;
    surchargeCents: number;
    totalCents: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/kiosk/${locationSlug}/sessions`)
      .then((r) => r.json())
      .then((b) => setSessions(b.sessions ?? []))
      .catch(() => setSessionsError("Could not load sessions. Please try again."));
  }, [locationSlug]);

  const minor = ageFromDob(contact.dob) < 18;
  const playerName = `${contact.firstName} ${contact.lastName}`.trim();
  const parentName = `${parent.firstName} ${parent.lastName}`.trim();

  const startBooking = async () => {
    if (!selectedSession) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/kiosk/${locationSlug}/walkin/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: selectedSession.id,
          contact,
          parent: minor ? parent : undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? `Could not start booking (${res.status})`);
        return;
      }
      setToken(body.token);
      setStep("waiver");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  const submitWaiver = async (acceptedName: string) => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/self-serve/${token}/waiver`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acceptedName }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError((b as { error?: string }).error ?? `Could not save waiver (${res.status})`);
        return;
      }
      setStep("photo");
    } finally {
      setBusy(false);
    }
  };

  const submitPhoto = async (file: File) => {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const photoRes = await fetch(`/api/self-serve/${token}/photo`, {
        method: "POST",
        body: form,
      });
      if (!photoRes.ok) {
        const b = await photoRes.json().catch(() => ({}));
        setError(
          (b as { error?: string }).error ?? `Could not upload photo (${photoRes.status})`,
        );
        return;
      }
      const payRes = await fetch(`/api/kiosk/${locationSlug}/walkin/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payBody = await payRes.json();
      if (!payRes.ok) {
        setError(
          (payBody as { error?: string }).error ??
            `Could not start payment (${payRes.status})`,
        );
        return;
      }
      const pay = payBody as {
        clientSecret: string;
        amountCents: number;
        baseAmountCents: number;
        surchargeCents: number;
      };
      setClientSecret(pay.clientSecret);
      setPaymentAmounts({
        baseAmountCents: pay.baseAmountCents,
        surchargeCents: pay.surchargeCents,
        totalCents: pay.amountCents,
      });
      setStep("payment");
    } finally {
      setBusy(false);
    }
  };

  if (step === "done") {
    return (
      <div className="space-y-6 pt-4">
        <header className="space-y-3">
          <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-primary">
            All set
          </p>
          <h1 className="font-display text-5xl md:text-6xl font-medium italic leading-[0.95] text-ink">
            You're checked in.
          </h1>
          <div className="h-px bg-border w-16" />
          <p className="text-base text-ink-2 leading-relaxed max-w-md">
            Welcome to {locationName}. See you on the field — head over whenever you're ready.
          </p>
        </header>
        <button type="button" onClick={onBack} className={PRIMARY_BTN}>
          Done
        </button>
      </div>
    );
  }

  const stepIndex = STEPS.indexOf(step);
  const progressPct = stepIndex >= 0 ? ((stepIndex + 1) / STEPS.length) * 100 : 0;

  return (
    <div className="space-y-8">
      <button type="button" onClick={onBack} className={GHOST_BTN}>
        ← Back
      </button>

      <header className="space-y-3">
        <p className="text-[11px] font-semibold tracking-[0.18em] uppercase text-primary">
          Walk-in registration
        </p>
        <h1 className="font-display text-4xl md:text-5xl font-medium italic leading-[0.95] text-ink">
          {STEP_LABEL[step]}
        </h1>
        {stepIndex >= 0 && (
          <div className="pt-2 space-y-2">
            <div className="flex items-baseline justify-between text-[11px] font-semibold tracking-[0.18em] uppercase text-ink-muted">
              <span>
                Step {String(stepIndex + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
              </span>
              <span className="text-ink-faint">{Math.round(progressPct)}%</span>
            </div>
            <div className="h-px bg-border relative overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-primary transition-all duration-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}
      </header>

      {error && (
        <div className="rounded-xl border border-rose-200/70 bg-rose-50/40 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {step === "session" && (
        <SessionStep
          sessions={sessions}
          sessionsError={sessionsError}
          onPick={(s) => {
            setSelectedSession(s);
            setStep("contact");
          }}
        />
      )}

      {step === "contact" && (
        <ContactStep
          contact={contact}
          setContact={setContact}
          parent={parent}
          setParent={setParent}
          minor={minor}
          busy={busy}
          onSubmit={startBooking}
        />
      )}

      {step === "waiver" && (
        <WaiverStep
          isMinor={minor}
          playerName={playerName}
          defaultSignerName={minor ? parentName : playerName}
          onSubmit={submitWaiver}
          busy={busy}
        />
      )}

      {step === "photo" && (
        <PhotoStep
          isMinor={minor}
          playerName={playerName}
          onSubmit={submitPhoto}
          busy={busy}
        />
      )}

      {step === "payment" && clientSecret && selectedSession && (
        <Elements
          stripe={getStripePromise(publishableKey)}
          options={{ clientSecret, appearance: { theme: "stripe" } }}
        >
          <PaymentStep
            session={selectedSession}
            amounts={paymentAmounts}
            onSuccess={() => setStep("done")}
          />
        </Elements>
      )}
    </div>
  );
}

// ============================================================================
// Step 1 — Session
// ============================================================================

function SessionStep({
  sessions,
  sessionsError,
  onPick,
}: {
  sessions: Session[];
  sessionsError: string | null;
  onPick: (s: Session) => void;
}) {
  if (sessionsError) {
    return (
      <p className="text-sm text-rose-700">{sessionsError}</p>
    );
  }
  if (sessions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-cream-2 px-5 py-8 text-center">
        <p className="font-display text-lg italic text-ink-muted">No open sessions today.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {sessions.map((s) => {
        const full = s.available <= 0;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onPick(s)}
            disabled={full}
            className="w-full text-left p-5 rounded-xl border border-border bg-paper hover:bg-cream-2 hover:border-ink/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-paper"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="font-medium text-ink truncate">{s.title}</div>
                <div className="text-sm text-ink-muted mt-1">
                  {s.spaceName} ·{" "}
                  {new Date(s.startsAt).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  {" – "}
                  {new Date(s.endsAt).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </div>
              </div>
              <div className="text-right shrink-0">
                {s.sessionRateCents != null && (
                  <div className="font-display text-2xl italic text-ink">
                    ${(s.sessionRateCents / 100).toFixed(2)}
                  </div>
                )}
                <div className="text-[11px] font-semibold tracking-[0.12em] uppercase text-ink-muted mt-0.5">
                  {full ? "Full" : `${s.available} / ${s.capacity} open`}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Step 2 — Contact
// ============================================================================

function ContactStep({
  contact,
  setContact,
  parent,
  setParent,
  minor,
  busy,
  onSubmit,
}: {
  contact: Contact;
  setContact: (c: Contact) => void;
  parent: Parent;
  setParent: (p: Parent) => void;
  minor: boolean;
  busy: boolean;
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
        Tell us who's playing. We'll use this for check-in and the waiver.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <input
          required
          placeholder="First name"
          value={contact.firstName}
          onChange={(e) => setContact({ ...contact, firstName: e.target.value })}
          className={INPUT_CLASS}
        />
        <input
          required
          placeholder="Last name"
          value={contact.lastName}
          onChange={(e) => setContact({ ...contact, lastName: e.target.value })}
          className={INPUT_CLASS}
        />
      </div>
      <input
        required
        type="email"
        placeholder="Email"
        value={contact.email}
        onChange={(e) => setContact({ ...contact, email: e.target.value })}
        className={INPUT_CLASS}
      />
      <input
        required
        type="tel"
        placeholder="Phone"
        value={contact.phone}
        onChange={(e) => setContact({ ...contact, phone: e.target.value })}
        className={INPUT_CLASS}
      />
      <div className="space-y-1.5">
        <label className="block text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted px-1">
          Date of birth
        </label>
        <input
          required
          type="date"
          value={contact.dob}
          onChange={(e) => setContact({ ...contact, dob: e.target.value })}
          className={INPUT_CLASS}
        />
      </div>

      {minor && (
        <div className="pt-4 mt-4 border-t border-border space-y-3">
          <div>
            <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-primary">
              Parent or guardian
            </p>
            <p className="text-sm text-ink-muted mt-1">
              Required for players under 18 — you'll sign the waiver on their behalf.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              required
              placeholder="Parent first name"
              value={parent.firstName}
              onChange={(e) => setParent({ ...parent, firstName: e.target.value })}
              className={INPUT_CLASS}
            />
            <input
              required
              placeholder="Parent last name"
              value={parent.lastName}
              onChange={(e) => setParent({ ...parent, lastName: e.target.value })}
              className={INPUT_CLASS}
            />
          </div>
          <input
            required
            type="email"
            placeholder="Parent email"
            value={parent.email}
            onChange={(e) => setParent({ ...parent, email: e.target.value })}
            className={INPUT_CLASS}
          />
          <input
            required
            type="tel"
            placeholder="Parent phone"
            value={parent.phone}
            onChange={(e) => setParent({ ...parent, phone: e.target.value })}
            className={INPUT_CLASS}
          />
        </div>
      )}

      <button type="submit" disabled={busy} className={PRIMARY_BTN}>
        {busy ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}

// ============================================================================
// Step 3 — Waiver
// ============================================================================

function WaiverStep({
  isMinor,
  playerName,
  defaultSignerName,
  onSubmit,
  busy,
}: {
  isMinor: boolean;
  playerName: string;
  defaultSignerName: string;
  onSubmit: (name: string) => void;
  busy: boolean;
}) {
  const [accepted, setAccepted] = useState(false);
  const [typed, setTyped] = useState(defaultSignerName);

  const acceptLabel = isMinor
    ? `I am the parent or legal guardian of ${playerName || "this player"} and accept these terms on their behalf.`
    : "I have read and accept these terms.";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(typed.trim());
      }}
      className="space-y-4"
    >
      <div className="rounded-xl border border-border bg-paper p-5">
        <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted mb-2">
          Liability waiver
        </p>
        <p className="text-sm text-ink-2 leading-relaxed">
          I acknowledge the inherent risks of recreational sports activity, including
          contact, falls, and weather-related conditions. I waive Aspire Sports and its
          partner venues from liability for injuries that occur during this session, and
          I confirm that the player named above is physically able to participate.
        </p>
      </div>

      <label className="flex items-start gap-3 p-4 rounded-xl border border-border bg-paper cursor-pointer hover:bg-cream-2 transition-colors">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
          className="mt-1 w-4 h-4 accent-primary"
        />
        <span className="text-sm text-ink leading-relaxed">{acceptLabel}</span>
      </label>

      <div className="space-y-1.5">
        <label className="block text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted px-1">
          {isMinor ? "Parent/guardian signature" : "Signature"}
        </label>
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Type your full name"
          className={INPUT_CLASS}
        />
      </div>

      <button
        type="submit"
        disabled={busy || !accepted || typed.trim().length === 0}
        className={PRIMARY_BTN}
      >
        {busy ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}

// ============================================================================
// Step 4 — Photo (camera + upload)
// ============================================================================

function PhotoStep({
  isMinor,
  playerName,
  onSubmit,
  busy,
}: {
  isMinor: boolean;
  playerName: string;
  onSubmit: (file: File) => void;
  busy: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File | null) => {
    setFile(f);
    if (preview) URL.revokeObjectURL(preview);
    setPreview(f ? URL.createObjectURL(f) : null);
  };

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const whoFor = isMinor && playerName ? playerName : "yourself";

  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">
        Add a quick photo of {whoFor} so the front desk can spot you at check-in.
      </p>

      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="user"
        className="sr-only"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />
      <input
        ref={uploadInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
      />

      {preview ? (
        <div className="rounded-xl border border-border bg-paper p-6 flex flex-col items-center gap-4">
          <img
            src={preview}
            alt="Profile preview"
            className="w-40 h-40 rounded-full object-cover ring-2 ring-border"
          />
          <button
            type="button"
            onClick={() => {
              handleFile(null);
              cameraInputRef.current?.click();
            }}
            className="inline-flex items-center gap-2 text-sm text-ink-muted hover:text-ink transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            Retake photo
          </button>
        </div>
      ) : (
        <div className="grid gap-3">
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="group w-full px-6 py-7 rounded-xl bg-primary text-cream text-left transition-all hover:bg-primary/90 active:scale-[0.99] shadow-sm"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-cream/15 flex items-center justify-center shrink-0">
                  <Camera className="w-6 h-6 text-cream" />
                </div>
                <div>
                  <div className="text-xs font-semibold tracking-[0.15em] uppercase text-cream/70 mb-1">
                    Recommended
                  </div>
                  <div className="text-xl font-medium">Take a photo with the camera</div>
                </div>
              </div>
              <span aria-hidden="true" className="text-2xl text-cream/80 transition-transform group-hover:translate-x-1">
                ›
              </span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => uploadInputRef.current?.click()}
            className="group w-full px-6 py-5 rounded-xl bg-paper border border-border hover:bg-cream-2 hover:border-ink/40 transition-colors text-left"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-cream-2 flex items-center justify-center shrink-0">
                <ImageIcon className="w-5 h-5 text-ink-muted" />
              </div>
              <div className="flex-1">
                <div className="text-base font-medium text-ink">Choose from device</div>
                <div className="text-xs text-ink-muted mt-0.5">
                  Upload an existing photo instead.
                </div>
              </div>
            </div>
          </button>
        </div>
      )}

      <button
        type="button"
        onClick={() => file && onSubmit(file)}
        disabled={!file || busy}
        className={PRIMARY_BTN}
      >
        {busy ? "Uploading…" : "Continue to payment"}
      </button>
    </div>
  );
}

// ============================================================================
// Step 5 — Payment
// ============================================================================

function PaymentStep({
  session,
  amounts,
  onSuccess,
}: {
  session: Session;
  amounts: {
    baseAmountCents: number;
    surchargeCents: number;
    totalCents: number;
  } | null;
  onSuccess: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    const result = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: window.location.href },
      redirect: "if_required",
    });
    if (result.error) {
      setError(result.error.message ?? "Payment failed");
      setBusy(false);
      return;
    }
    onSuccess();
  };

  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  const totalLabel = amounts ? fmt(amounts.totalCents) : null;

  return (
    <form onSubmit={onPay} className="space-y-4">
      <div className="rounded-xl border border-border bg-paper p-5 space-y-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted">
            Today's session
          </p>
          <p className="text-base font-medium text-ink mt-1">{session.title}</p>
        </div>
        {amounts && (
          <div className="border-t border-border pt-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-ink-muted">
              <span>Session</span>
              <span>{fmt(amounts.baseAmountCents)}</span>
            </div>
            <div className="flex justify-between text-ink-muted">
              <span>Card processing fee</span>
              <span>{fmt(amounts.surchargeCents)}</span>
            </div>
            <div className="flex justify-between items-baseline pt-1.5 border-t border-border">
              <span className="font-medium text-ink">Total</span>
              <span className="font-display text-2xl italic text-ink">
                {fmt(amounts.totalCents)}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border bg-paper p-5">
        <PaymentElement />
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200/70 bg-rose-50/40 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      <button type="submit" disabled={busy} className={PRIMARY_BTN}>
        {busy ? "Processing…" : totalLabel ? `Pay ${totalLabel}` : "Pay"}
      </button>
    </form>
  );
}
