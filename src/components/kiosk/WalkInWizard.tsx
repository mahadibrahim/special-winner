"use client";

import { useEffect, useState } from "react";
import { ErrorBanner } from "@/components/ui/error-banner";

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

/**
 * The wizard's own scope ends at the contact step. Everything after it —
 * waiver, photo, payment — is the shared self-serve flow, which KioskRoot
 * renders inline once `startBooking` hands it a token. There is deliberately
 * no second implementation of those cards here.
 */
type Step = "session" | "contact";

const STEPS: Step[] = ["session", "contact"];
const STEP_LABEL: Record<Step, string> = {
  session: "Pick a session",
  contact: "Your details",
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

interface Props {
  locationSlug: string;
  /** Hands the minted walk-in token up to KioskRoot, which takes over with
   *  the shared SelfServe cards. This component never navigates the tab. */
  onToken: (token: string) => void;
  onBack: () => void;
}

const INPUT_CLASS =
  "w-full px-4 py-3 bg-paper border border-border focus:border-ink focus:outline-none rounded-lg text-base text-ink placeholder:text-ink-faint transition-colors";

const PRIMARY_BTN =
  "w-full min-h-[60px] px-6 py-4 rounded-xl bg-primary text-cream text-lg font-medium transition-all hover:bg-primary/90 active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed";

const GHOST_BTN =
  "min-h-[44px] text-base text-ink-muted hover:text-ink transition-colors";

export function WalkInWizard({ locationSlug, onToken, onBack }: Props) {
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
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/kiosk/${locationSlug}/sessions`)
      .then((r) => r.json())
      .then((b) => setSessions(b.sessions ?? []))
      .catch(() => setSessionsError("Could not load sessions. Please try again."));
  }, [locationSlug]);

  const minor = ageFromDob(contact.dob) < 18;

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
        setBusy(false);
        return;
      }
      // Hand off — SelfServe owns waiver, photo, and payment from here.
      // onToken is fire-and-forget (KioskRoot is still fetching the token's
      // context), so leave `busy` true rather than re-enabling Continue
      // before the handoff lands — otherwise a laggy iPad double-tap can
      // fire the request twice.
      onToken(body.token as string);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
      setBusy(false);
    }
  };

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
        <p className="text-sm text-ink-muted">
          Step {stepIndex + 1} of {STEPS.length} — then waiver, photo, and payment.
        </p>
        <div className="pt-2 space-y-2">
          <div className="flex items-baseline justify-between text-[11px] font-semibold tracking-[0.18em] uppercase text-ink-muted">
            <span>
              Step {String(stepIndex + 1).padStart(2, "0")} /{" "}
              {String(STEPS.length).padStart(2, "0")}
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
      </header>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

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
    return <ErrorBanner message={sessionsError} />;
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
            className="w-full min-h-[60px] text-left p-5 rounded-xl border border-border bg-paper hover:bg-cream-2 hover:border-ink/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-paper"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-base font-medium text-ink truncate">{s.title}</div>
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
