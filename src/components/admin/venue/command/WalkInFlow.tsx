"use client";

/**
 * WalkInFlow — 3-step command-center walk-in form.
 *
 * Step 1: Who's playing? (adult / child, name, DOB, contact)
 * Step 2: Waiver (sign on device / text link)
 * Step 3: Take payment (send pay link email|SMS, or kiosk self-pay hand-off)
 *
 * On submit: POST /api/kiosk/[locationId]/walkin/start with walkInToPayload(...).
 * The locationId doubles as the [locationSlug] param — the kiosk auth resolves
 * UUIDs as well as human slugs (see kiosk-auth.ts).
 *
 * For payment method "link": show a success state with the self-serve URL.
 * For payment method "kiosk": show a hand-off instruction (go to kiosk device).
 * On success: call onDone() so the roster panel refetches.
 */

import { useState } from "react";
import { walkInToPayload } from "@/lib/venue/walkin-payload";
import type { WalkInForm } from "@/lib/venue/walkin-payload";
import type { VenueTodaySession } from "@/lib/venue/today-types";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  session: VenueTodaySession;
  /** locationId is passed as the kiosk slug (UUIDs work per kiosk-auth.ts). */
  locationId: string;
  onDone: () => void;
  onCancel: () => void;
}

// ─── Local state shape ────────────────────────────────────────────────────────

type PayMethod = "link_email" | "link_sms" | "kiosk";
type WaiverMethod = "device" | "sms";

interface FormState {
  mode: "adult" | "child";
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  dob: string;
  // Child-only
  parentFirstName: string;
  parentLastName: string;
  parentEmail: string;
  parentPhone: string;
}

const EMPTY_FORM: FormState = {
  mode: "adult",
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  dob: "",
  parentFirstName: "",
  parentLastName: "",
  parentEmail: "",
  parentPhone: "",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StepBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-[#1c1a17] text-[#fffdf8] text-xs font-black mr-2 flex-shrink-0">
      {n}
    </span>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[11.5px] font-bold text-[#4b463e] mb-1">
      {children}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="w-full border border-[#e4ddcf] rounded-lg px-3 py-2 bg-[#fffdf8] text-[13.5px] text-[#1c1a17] focus:outline-none focus:border-[#1c1a17] focus:ring-1 focus:ring-[#1c1a17]/20"
    />
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function WalkInFlow({ session, locationId, onDone, onCancel }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [waiverMethod, setWaiverMethod] = useState<WaiverMethod>("sms");
  const [payMethod, setPayMethod] = useState<PayMethod>("link_sms");
  const [busy, setBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    url: string;
    amountDueCents: number;
    method: PayMethod;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const set = (k: keyof FormState, v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setBusy(true);

    // Build the mapped form for walkInToPayload
    const mappedForm: WalkInForm = {
      mode: form.mode,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      dob: form.dob.trim(),
      sessionId: session.id,
      ...(form.mode === "child"
        ? {
            parentFirstName: form.parentFirstName.trim(),
            parentLastName: form.parentLastName.trim(),
            parentEmail: form.parentEmail.trim(),
            parentPhone: form.parentPhone.trim(),
          }
        : {}),
    };

    const payOption =
      payMethod === "kiosk"
        ? ({ method: "kiosk" } as const)
        : payMethod === "link_email"
          ? ({ method: "link", linkChannel: "email" } as const)
          : ({ method: "link", linkChannel: "sms" } as const);

    const payload = walkInToPayload(mappedForm, payOption);

    try {
      const res = await fetch(`/api/kiosk/${locationId}/walkin/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Strip the UI-only paymentMethod/linkChannel before sending to kiosk endpoint
        body: JSON.stringify({
          sessionId: payload.sessionId,
          contact: payload.contact,
          ...(payload.parent ? { parent: payload.parent } : {}),
        }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        setSubmitError(body.error ?? `Failed (${res.status})`);
        setBusy(false);
        return;
      }

      setResult({
        url: body.url,
        amountDueCents: body.amountDueCents ?? 0,
        method: payMethod,
      });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  // ── Success / hand-off screen ──────────────────────────────────────────────
  if (result) {
    const amtStr = `$${(result.amountDueCents / 100).toFixed(2)}`;
    return (
      <div className="absolute inset-0 bg-[#fffdf8] flex flex-col overflow-y-auto z-10">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-[#e4ddcf]">
          <div className="text-[10.5px] uppercase tracking-widest font-bold text-teal-700">
            Walk-in
          </div>
          <div className="font-semibold text-[#1c1a17] flex-1">
            {form.firstName} {form.lastName}
          </div>
          <button
            type="button"
            onClick={onDone}
            className="text-[#8a8175] hover:text-[#1c1a17] text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 py-8 text-center">
          {result.method === "kiosk" ? (
            <>
              <div className="text-4xl">📱</div>
              <h3 className="text-lg font-bold text-[#1c1a17]">
                Hand off to kiosk device
              </h3>
              <p className="text-sm text-[#4b463e] max-w-xs">
                The booking is created. Hand the device to{" "}
                <strong>
                  {form.firstName} {form.lastName}
                </strong>{" "}
                to complete payment of <strong>{amtStr}</strong> at the kiosk.
              </p>
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#8a8175] underline break-all max-w-xs"
              >
                {result.url}
              </a>
            </>
          ) : (
            <>
              <div className="text-4xl">
                {result.method === "link_email" ? "📧" : "📲"}
              </div>
              <h3 className="text-lg font-bold text-[#1c1a17]">
                Booking created — share the link
              </h3>
              <p className="text-sm text-[#4b463e] max-w-xs">
                Share this payment link (<strong>{amtStr}</strong>) with{" "}
                <strong>
                  {form.firstName} {form.lastName}
                </strong>{" "}
                via{" "}
                {result.method === "link_email"
                  ? form.email
                    ? `email (${form.email})`
                    : "email"
                  : form.phone
                    ? `SMS (${form.phone})`
                    : "SMS"}
                . The slot is held for 2 hours.
              </p>
              <div className="w-full max-w-xs">
                <div className="flex items-center gap-2 border border-[#e4ddcf] rounded-lg px-3 py-2 bg-[#f6f1e7]">
                  <span className="flex-1 text-xs text-[#4b463e] break-all leading-tight">
                    {result.url}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(result.url).then(() => {
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2000);
                      });
                    }}
                    className="flex-shrink-0 text-xs px-2 py-1 rounded bg-[#1c1a17] text-[#fffdf8] font-semibold"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            </>
          )}

          <button
            type="button"
            onClick={onDone}
            className="mt-2 px-6 py-2.5 bg-[#1c1a17] text-[#fffdf8] rounded-lg text-sm font-bold"
          >
            Done — back to roster
          </button>
        </div>
      </div>
    );
  }

  // ── Main form ───────────────────────────────────────────────────────────────
  return (
    <div className="absolute inset-0 bg-[#fffdf8] flex flex-col overflow-y-auto z-10">
      {/* Panel header */}
      <div className="flex-none px-4 py-3 border-b border-[#e4ddcf]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[10.5px] uppercase tracking-widest font-bold text-teal-700 mb-0.5">
              Walk-in
            </div>
            <h3 className="text-base font-semibold text-[#1c1a17]">
              Add to {session.title}
            </h3>
            <p className="text-xs text-[#4b463e]">Filling an open slot</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="text-[#8a8175] hover:text-[#1c1a17] text-2xl leading-none flex-shrink-0 mt-0.5"
            aria-label="Cancel"
          >
            ×
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
        {/* ── Step 1: Who's playing? ──────────────────────────────────────── */}
        <div className="px-4 py-4 border-b border-[#efe9dc]">
          <h4 className="flex items-center text-sm font-semibold text-[#1c1a17] mb-3">
            <StepBadge n={1} />
            Who&apos;s playing?
          </h4>

          {/* Adult / Child toggle */}
          <div className="flex bg-[#f6f1e7] border border-[#e4ddcf] rounded-lg p-0.5 w-fit mb-3">
            {(["adult", "child"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => set("mode", m)}
                className={`px-4 py-1.5 rounded-md text-xs font-bold capitalize transition-colors ${
                  form.mode === m
                    ? "bg-[#1c1a17] text-[#fffdf8]"
                    : "text-[#4b463e] hover:text-[#1c1a17]"
                }`}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Player name + DOB */}
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <FieldLabel>First name</FieldLabel>
              <TextInput
                value={form.firstName}
                onChange={(v) => set("firstName", v)}
                placeholder="First"
                required
              />
            </div>
            <div>
              <FieldLabel>Last name</FieldLabel>
              <TextInput
                value={form.lastName}
                onChange={(v) => set("lastName", v)}
                placeholder="Last"
                required
              />
            </div>
          </div>

          <div className="mb-2">
            <FieldLabel>Date of birth</FieldLabel>
            <TextInput
              value={form.dob}
              onChange={(v) => set("dob", v)}
              placeholder="YYYY-MM-DD"
              type="date"
              required
            />
          </div>

          {/* Adult contact */}
          {form.mode === "adult" && (
            <>
              <div className="mb-2">
                <FieldLabel>Email</FieldLabel>
                <TextInput
                  value={form.email}
                  onChange={(v) => set("email", v)}
                  placeholder="email@example.com"
                  type="email"
                  required
                />
              </div>
              <div>
                <FieldLabel>Mobile (for waiver link + receipt)</FieldLabel>
                <TextInput
                  value={form.phone}
                  onChange={(v) => set("phone", v)}
                  placeholder="(614) 555-0142"
                  type="tel"
                />
              </div>
            </>
          )}

          {/* Child: parent contact */}
          {form.mode === "child" && (
            <div className="mt-3 space-y-2">
              <p className="text-[11px] text-[#8a8175] font-medium uppercase tracking-wide">
                Parent / guardian
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel>Parent first name</FieldLabel>
                  <TextInput
                    value={form.parentFirstName}
                    onChange={(v) => set("parentFirstName", v)}
                    placeholder="First"
                    required
                  />
                </div>
                <div>
                  <FieldLabel>Parent last name</FieldLabel>
                  <TextInput
                    value={form.parentLastName}
                    onChange={(v) => set("parentLastName", v)}
                    placeholder="Last"
                    required
                  />
                </div>
              </div>
              <div>
                <FieldLabel>Parent email</FieldLabel>
                <TextInput
                  value={form.parentEmail}
                  onChange={(v) => set("parentEmail", v)}
                  placeholder="parent@example.com"
                  type="email"
                  required
                />
              </div>
              <div>
                <FieldLabel>Parent mobile</FieldLabel>
                <TextInput
                  value={form.parentPhone}
                  onChange={(v) => set("parentPhone", v)}
                  placeholder="(614) 555-0142"
                  type="tel"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Step 2: Waiver ──────────────────────────────────────────────── */}
        <div className="px-4 py-4 border-b border-[#efe9dc]">
          <h4 className="flex items-center text-sm font-semibold text-[#1c1a17] mb-3">
            <StepBadge n={2} />
            Waiver
          </h4>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setWaiverMethod("device")}
              className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors ${
                waiverMethod === "device"
                  ? "bg-[#1c1a17] text-[#fffdf8] border-[#1c1a17]"
                  : "border-[#e4ddcf] bg-[#f6f1e7] text-[#4b463e] hover:border-[#4b463e]"
              }`}
            >
              Sign on this device
            </button>
            <button
              type="button"
              onClick={() => setWaiverMethod("sms")}
              className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors ${
                waiverMethod === "sms"
                  ? "bg-[#1c1a17] text-[#fffdf8] border-[#1c1a17]"
                  : "border-[#e4ddcf] bg-[#f6f1e7] text-[#4b463e] hover:border-[#4b463e]"
              }`}
            >
              Text link to phone
            </button>
          </div>
          {waiverMethod === "device" && (
            <p className="text-[11.5px] text-[#8a8175] mt-2">
              Waiver link included in the self-serve URL — customer signs on the
              device before payment.
            </p>
          )}
          {waiverMethod === "sms" && (
            <p className="text-[11.5px] text-[#8a8175] mt-2">
              Waiver + pay link sent to their mobile number after booking is
              created.
            </p>
          )}
        </div>

        {/* ── Step 3: Take payment ─────────────────────────────────────────── */}
        <div className="px-4 py-4">
          <h4 className="flex items-center text-sm font-semibold text-[#1c1a17] mb-3">
            <StepBadge n={3} />
            Take payment
          </h4>

          {/* Payment method cards */}
          <div className="space-y-2 mb-4">
            {(
              [
                {
                  method: "link_email" as PayMethod,
                  icon: "📧",
                  title: "Email a pay link",
                  subtitle: "They pay on their phone; slot holds 2h until paid",
                },
                {
                  method: "link_sms" as PayMethod,
                  icon: "📲",
                  title: "Text a pay link",
                  subtitle: "They pay on their phone; slot holds 2h until paid",
                },
                {
                  method: "kiosk" as PayMethod,
                  icon: "💳",
                  title: "Kiosk self-pay",
                  subtitle:
                    "Hand device to customer — they tap/insert card at the kiosk",
                },
              ] satisfies { method: PayMethod; icon: string; title: string; subtitle: string }[]
            ).map(({ method, icon, title, subtitle }) => (
              <button
                key={method}
                type="button"
                onClick={() => setPayMethod(method)}
                className={`w-full flex items-center gap-3 border rounded-xl px-3 py-2.5 text-left transition-shadow ${
                  payMethod === method
                    ? "border-[#1c1a17] shadow-[0_0_0_2px_rgba(28,26,23,0.12)] bg-[#fffdf8]"
                    : "border-[#e4ddcf] bg-[#fffdf8] hover:border-[#4b463e]"
                }`}
              >
                <div className="w-9 h-9 rounded-lg bg-[#f6f1e7] flex items-center justify-center text-lg flex-shrink-0">
                  {icon}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-[13.5px] text-[#1c1a17]">{title}</div>
                  <div className="text-[11.5px] text-[#8a8175] truncate">{subtitle}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Submit error */}
          {submitError && (
            <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 mb-3">
              {submitError}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={busy}
            className="w-full bg-[#1c1a17] text-[#fffdf8] border-0 rounded-xl py-3 text-sm font-black disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {busy
              ? "Creating booking…"
              : payMethod === "kiosk"
                ? "Create booking & hand off to kiosk ›"
                : "Create booking & send pay link ›"}
          </button>
          <p className="text-[11.5px] text-[#8a8175] text-center mt-2">
            On success: added to the roster, slot held for payment.
          </p>
        </div>
      </form>
    </div>
  );
}
