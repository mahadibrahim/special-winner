"use client";

import { useState } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { SOCCERONE_CONTACT_EMAIL } from "@/lib/soccerone/contact";

type Tier =
  | "supporter"
  | "sideline"
  | "center-circle"
  | "title"
  | "team-kit"
  | "tournament"
  | "not-sure";
type Facility = "worthington" | "downtown" | "both" | "no-preference";

export default function SponsorInquiryForm() {
  useHydrationBeacon();

  const [businessName, setBusinessName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [tierInterest, setTierInterest] = useState<"" | Tier>("");
  const [facility, setFacility] = useState<"" | Facility>("");
  const [message, setMessage] = useState("");

  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("submitting");
    setError(null);
    try {
      const res = await fetch("/api/public/sponsor-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: businessName.trim(),
          contactName: contactName.trim(),
          contactEmail: contactEmail.trim(),
          contactPhone: contactPhone.trim() || undefined,
          website: website.trim() || undefined,
          tierInterest: tierInterest || undefined,
          facility: facility || undefined,
          message: message.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error ?? "Could not submit inquiry");
      }
      setStatus("ok");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit inquiry");
      setStatus("error");
    }
  };

  if (status === "ok") {
    return (
      <section id="inquiry" className="sponsor-form-wrap">
        <div className="sf-success">
          <CheckCircle2 className="sf-success-icon" />
          <div>
            <h3 className="sf-success-title">Got it.</h3>
            <p className="sf-success-body">
              Thanks — we'll be in touch within one business day to talk packages and
              placement. Anything urgent? Email{" "}
              <a href={`mailto:${SOCCERONE_CONTACT_EMAIL}`}>{SOCCERONE_CONTACT_EMAIL}</a>.
            </p>
          </div>
        </div>
        <FormStyles />
      </section>
    );
  }

  return (
    <section id="inquiry" className="sponsor-form-wrap">
      <form onSubmit={handleSubmit} className="sf-form">
        <div className="sf-grid">
          <Field label="Business name" required>
            <input className="sf-input" value={businessName}
              onChange={(e) => setBusinessName(e.target.value)} required />
          </Field>
          <Field label="Your name" required>
            <input className="sf-input" value={contactName}
              onChange={(e) => setContactName(e.target.value)} required />
          </Field>
        </div>

        <div className="sf-grid">
          <Field label="Email" required>
            <input className="sf-input" type="email" value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)} required />
          </Field>
          <Field label="Phone (optional)">
            <input className="sf-input" type="tel" value={contactPhone}
              onChange={(e) => setContactPhone(e.target.value)} />
          </Field>
        </div>

        <div className="sf-grid">
          <Field label="Website (optional)">
            <input className="sf-input" value={website}
              onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
          </Field>
          <Field label="Tier of interest">
            <select className="sf-input" value={tierInterest}
              onChange={(e) => setTierInterest(e.target.value as "" | Tier)}>
              <option value="">Select…</option>
              <option value="supporter">Supporter — $300</option>
              <option value="sideline">Sideline — $1,000</option>
              <option value="center-circle">Center Circle — $2,500</option>
              <option value="title">Title — $5,000</option>
              <option value="team-kit">Team / league kit</option>
              <option value="tournament">Tournament title</option>
              <option value="not-sure">Not sure yet</option>
            </select>
          </Field>
        </div>

        <Field label="Facility">
          <select className="sf-input" value={facility}
            onChange={(e) => setFacility(e.target.value as "" | Facility)}>
            <option value="">Select…</option>
            <option value="worthington">Worthington</option>
            <option value="downtown">Downtown</option>
            <option value="both">Both</option>
            <option value="no-preference">No preference</option>
          </select>
        </Field>

        <Field label="Anything else?">
          <textarea className="sf-input sf-textarea" value={message} rows={4} maxLength={2000}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Goals, budget, timing — anything that helps us tailor a package." />
        </Field>

        {error && (
          <p className="sf-error">
            {error} You can also email{" "}
            <a href={`mailto:${SOCCERONE_CONTACT_EMAIL}`}>{SOCCERONE_CONTACT_EMAIL}</a>.
          </p>
        )}

        <button type="submit" className="sf-submit" disabled={status === "submitting"}>
          {status === "submitting" ? (
            <><Loader2 className="sf-spin" /> Sending…</>
          ) : (
            "Become a sponsor →"
          )}
        </button>
      </form>
      <FormStyles />
    </section>
  );
}

function Field({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <label className="sf-field">
      <span className="sf-label">
        {label}
        {required && <span className="sf-req"> *</span>}
      </span>
      {children}
    </label>
  );
}

function FormStyles() {
  return (
    <style>{`
      .sponsor-form-wrap { max-width: 760px; margin: 0 auto; }
      .sf-form { display: flex; flex-direction: column; gap: 1.25rem; }
      .sf-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
      @media (max-width: 640px) { .sf-grid { grid-template-columns: 1fr; } }
      .sf-field { display: flex; flex-direction: column; gap: 0.5rem; }
      .sf-label {
        font-family: var(--so-font-mono); font-size: 0.625rem; font-weight: 600;
        letter-spacing: 0.12em; text-transform: uppercase; color: var(--so-lime);
      }
      .sf-req { color: var(--so-lime); }
      .sf-input {
        width: 100%; padding: 0.7rem 0.85rem;
        background: var(--so-surface); color: var(--so-white);
        border: 1px solid var(--so-lime-a20); border-radius: var(--so-radius-sm);
        font-family: var(--so-font-body); font-size: 0.9375rem;
        transition: border-color 0.15s;
      }
      .sf-input:focus { outline: none; border-color: var(--so-lime); }
      .sf-input::placeholder { color: rgba(255,255,255,0.3); }
      .sf-textarea { resize: vertical; }
      .sf-error { color: #fca5a5; font-size: 0.875rem; margin: 0; }
      .sf-error a { color: var(--so-lime); }
      .sf-submit {
        align-self: flex-start; display: inline-flex; align-items: center; gap: 0.5rem;
        padding: 0.85rem 1.75rem; background: var(--so-lime); color: var(--so-ink);
        font-family: var(--so-font-body); font-weight: 700; font-size: 0.875rem;
        letter-spacing: 0.04em; text-transform: uppercase;
        border: none; border-radius: var(--so-radius-sm); cursor: pointer;
        transition: background 0.15s;
      }
      .sf-submit:hover { background: var(--so-lime-bright); }
      .sf-submit:disabled { opacity: 0.6; cursor: default; }
      .sf-spin { width: 1rem; height: 1rem; animation: sf-spin 0.8s linear infinite; }
      @keyframes sf-spin { to { transform: rotate(360deg); } }
      .sf-success {
        display: flex; gap: 1rem; align-items: flex-start;
        background: var(--so-lime-a08); border: 1px solid var(--so-lime-a20);
        border-radius: var(--so-radius-lg); padding: 1.75rem;
      }
      .sf-success-icon { width: 1.5rem; height: 1.5rem; color: var(--so-lime); flex-shrink: 0; }
      .sf-success-title { font-family: var(--so-font-display); font-size: 1.5rem; color: var(--so-white); margin: 0 0 0.4rem; }
      .sf-success-body { color: rgba(255,255,255,0.7); line-height: 1.55; margin: 0; }
      .sf-success-body a { color: var(--so-lime); }
    `}</style>
  );
}
