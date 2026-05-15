"use client";

import { useEffect, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from "@stripe/react-stripe-js";
import type { Stripe as StripeJs } from "@stripe/stripe-js";

interface Session {
  id: string;
  startsAt: string;
  endsAt: string;
  title: string;
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

function ageFromDob(dob: string): number {
  if (!dob) return 99;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return 99;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) age--;
  return age;
}

// Cache one Stripe.js promise per publishable key for the page lifetime.
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
  venueSlug: string;
  venueName: string;
  publishableKey: string;
  onBack: () => void;
}

export function WalkInWizard({ venueSlug, venueName, publishableKey, onBack }: Props) {
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/kiosk/${venueSlug}/sessions`)
      .then((r) => r.json())
      .then((b) => setSessions(b.sessions ?? []))
      .catch(() => setSessionsError("Could not load sessions. Please try again."));
  }, [venueSlug]);

  const minor = ageFromDob(contact.dob) < 18;

  const startBooking = async () => {
    if (!selectedSession) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/kiosk/${venueSlug}/walkin/start`, {
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
      // Initialize payment after photo upload succeeds
      const payRes = await fetch(`/api/kiosk/${venueSlug}/walkin/payment`, {
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
      setClientSecret((payBody as { clientSecret: string }).clientSecret);
      setStep("payment");
    } finally {
      setBusy(false);
    }
  };

  if (step === "done") {
    return (
      <div className="p-6 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-900 text-center space-y-2">
        <h1 className="text-xl font-semibold">You're checked in</h1>
        <p className="text-sm">Welcome to {venueName}! See you on the field.</p>
      </div>
    );
  }

  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="text-sm text-stone-600">
        ← Back
      </button>
      <header>
        <h1 className="text-xl font-semibold">Walk-in registration</h1>
        {stepIndex >= 0 && (
          <p className="text-stone-600 text-sm">
            Step {stepIndex + 1} of {STEPS.length}
          </p>
        )}
      </header>

      {error && (
        <div className="p-3 rounded bg-rose-50 border border-rose-200 text-rose-800 text-sm">
          {error}
        </div>
      )}

      {/* Step 1: Pick a session */}
      {step === "session" && (
        <div className="space-y-2">
          <h2 className="font-medium">Pick a session</h2>
          {sessionsError ? (
            <p className="text-sm text-rose-700">{sessionsError}</p>
          ) : sessions.length === 0 ? (
            <p className="text-sm text-stone-500">No open sessions today.</p>
          ) : (
            sessions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  setSelectedSession(s);
                  setStep("contact");
                }}
                disabled={s.available <= 0}
                className="w-full text-left p-3 border rounded-lg flex items-center justify-between disabled:opacity-50"
              >
                <div>
                  <div className="font-medium">{s.title}</div>
                  <div className="text-xs text-stone-500">
                    {new Date(s.startsAt).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {" – "}
                    {new Date(s.endsAt).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    {s.sessionRateCents != null &&
                      ` · $${(s.sessionRateCents / 100).toFixed(2)}`}
                  </div>
                </div>
                <div className="text-xs text-stone-500">
                  {s.available} / {s.capacity} open
                </div>
              </button>
            ))
          )}
        </div>
      )}

      {/* Step 2: Contact info */}
      {step === "contact" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            startBooking();
          }}
          className="space-y-3"
        >
          <h2 className="font-medium">Your information</h2>
          <div className="grid grid-cols-2 gap-2">
            <input
              required
              placeholder="First name"
              value={contact.firstName}
              onChange={(e) => setContact({ ...contact, firstName: e.target.value })}
              className="border rounded px-3 py-2"
            />
            <input
              required
              placeholder="Last name"
              value={contact.lastName}
              onChange={(e) => setContact({ ...contact, lastName: e.target.value })}
              className="border rounded px-3 py-2"
            />
          </div>
          <input
            required
            type="email"
            placeholder="Email"
            value={contact.email}
            onChange={(e) => setContact({ ...contact, email: e.target.value })}
            className="w-full border rounded px-3 py-2"
          />
          <input
            required
            type="tel"
            placeholder="Phone"
            value={contact.phone}
            onChange={(e) => setContact({ ...contact, phone: e.target.value })}
            className="w-full border rounded px-3 py-2"
          />
          <label className="block text-xs text-stone-600">Date of birth</label>
          <input
            required
            type="date"
            value={contact.dob}
            onChange={(e) => setContact({ ...contact, dob: e.target.value })}
            className="w-full border rounded px-3 py-2"
          />
          {minor && (
            <div className="border-t pt-3 space-y-2">
              <p className="text-sm font-medium">Parent/guardian (required for under 18)</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  required
                  placeholder="Parent first name"
                  value={parent.firstName}
                  onChange={(e) => setParent({ ...parent, firstName: e.target.value })}
                  className="border rounded px-3 py-2"
                />
                <input
                  required
                  placeholder="Parent last name"
                  value={parent.lastName}
                  onChange={(e) => setParent({ ...parent, lastName: e.target.value })}
                  className="border rounded px-3 py-2"
                />
              </div>
              <input
                required
                type="email"
                placeholder="Parent email"
                value={parent.email}
                onChange={(e) => setParent({ ...parent, email: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
              <input
                required
                type="tel"
                placeholder="Parent phone"
                value={parent.phone}
                onChange={(e) => setParent({ ...parent, phone: e.target.value })}
                className="w-full border rounded px-3 py-2"
              />
            </div>
          )}
          <button
            type="submit"
            disabled={busy}
            className="w-full px-4 py-3 rounded bg-stone-900 text-white disabled:opacity-50"
          >
            {busy ? "..." : "Continue"}
          </button>
        </form>
      )}

      {/* Step 3: Waiver */}
      {step === "waiver" && (
        <WaiverStep
          signerName={
            minor
              ? `${parent.firstName} ${parent.lastName}`.trim()
              : `${contact.firstName} ${contact.lastName}`.trim()
          }
          onSubmit={submitWaiver}
          busy={busy}
        />
      )}

      {/* Step 4: Photo */}
      {step === "photo" && <PhotoStep onSubmit={submitPhoto} busy={busy} />}

      {/* Step 5: Payment */}
      {step === "payment" && clientSecret && (
        <Elements
          stripe={getStripePromise(publishableKey)}
          options={{ clientSecret, appearance: { theme: "stripe" } }}
        >
          <PaymentStep onSuccess={() => setStep("done")} />
        </Elements>
      )}
    </div>
  );
}

// --- Sub-components ---

function WaiverStep({
  signerName,
  onSubmit,
  busy,
}: {
  signerName: string;
  onSubmit: (name: string) => void;
  busy: boolean;
}) {
  const [accepted, setAccepted] = useState(false);
  const [typed, setTyped] = useState(signerName);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(typed.trim());
      }}
      className="space-y-3"
    >
      <h2 className="font-medium">Sign the liability waiver</h2>
      <p className="text-sm bg-stone-50 border rounded p-3">
        I acknowledge the inherent risks of recreational sports activity. I waive Aspire
        Sports from liability for injuries during this session.
      </p>
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(e) => setAccepted(e.target.checked)}
        />
        <span>I accept on behalf of the player above</span>
      </label>
      <input
        type="text"
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder="Type signer name"
        className="w-full border rounded px-3 py-2"
      />
      <button
        type="submit"
        disabled={busy || !accepted || typed.trim().length === 0}
        className="w-full px-4 py-3 rounded bg-stone-900 text-white disabled:opacity-50"
      >
        {busy ? "..." : "Continue"}
      </button>
    </form>
  );
}

function PhotoStep({
  onSubmit,
  busy,
}: {
  onSubmit: (file: File) => void;
  busy: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <h2 className="font-medium">Take a photo</h2>
      <input
        type="file"
        accept="image/*"
        capture="user"
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          setFile(f);
          if (f) setPreview(URL.createObjectURL(f));
        }}
      />
      {preview && (
        <img
          src={preview}
          alt="Preview"
          className="w-32 h-32 rounded-full object-cover mx-auto"
        />
      )}
      <button
        type="button"
        onClick={() => file && onSubmit(file)}
        disabled={!file || busy}
        className="w-full px-4 py-3 rounded bg-stone-900 text-white disabled:opacity-50"
      >
        {busy ? "..." : "Continue to payment"}
      </button>
    </div>
  );
}

function PaymentStep({ onSuccess }: { onSuccess: () => void }) {
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

  return (
    <form onSubmit={onPay} className="space-y-3">
      <h2 className="font-medium">Pay to confirm your spot</h2>
      <PaymentElement />
      {error && <div className="text-sm text-rose-700">{error}</div>}
      <button
        type="submit"
        disabled={busy}
        className="w-full px-4 py-3 rounded bg-stone-900 text-white disabled:opacity-50"
      >
        {busy ? "Processing..." : "Pay"}
      </button>
    </form>
  );
}
