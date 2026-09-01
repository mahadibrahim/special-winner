"use client";

/**
 * WalkInFlow — 3-step command-center walk-in form.
 *
 * Step 1: Who's playing? (adult / child, name, DOB, contact)
 * Step 2: Waiver (sign on device / text link)
 * Step 3: How they'll finish signing up (email|SMS a pay link, or kiosk self-pay hand-off)
 *
 * On submit: POST /api/kiosk/[locationId]/walkin/start with walkInToPayload(...).
 * The locationId doubles as the [locationSlug] param — the kiosk auth resolves
 * UUIDs as well as human slugs (see kiosk-auth.ts).
 *
 * For payment method "link": show a success state with the self-serve URL.
 * The link is a real pay link — the same walkin_session token PayCard
 * serves collects the waiver, a photo, AND payment, and the hold behind it
 * genuinely lasts 2 hours (see docs/superpowers/plans/
 * 2026-07-12-walkin-remote-payment.md, Task 6 + Task 7).
 * For payment method "kiosk": show a hand-off instruction (go to kiosk device).
 * On success: call onDone() so the roster panel refetches.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { walkInToPayload } from "@/lib/venue/walkin-payload";
import type { WalkInForm } from "@/lib/venue/walkin-payload";
import type { VenueTodaySession } from "@/lib/venue/today-types";
import { ErrorBanner } from "@/components/ui/error-banner";

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
    /** true if the send-link POST succeeded; false = copy-fallback mode */
    sent: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const set = (k: keyof FormState, v: string) =>
    setForm((prev) => ({ ...prev, [k]: v }));

  // ── Contact-derived availability ─────────────────────────────────────────
  const contactPhone = form.mode === "child" ? form.parentPhone.trim() : form.phone.trim();
  const contactEmail = form.mode === "child" ? form.parentEmail.trim() : form.email.trim();
  const hasPhone = contactPhone.length > 0;
  const hasEmail = contactEmail.length > 0;

  // Auto-correct selections when the contact fields that back them disappear.
  useEffect(() => {
    if (!hasPhone && payMethod === "link_sms") setPayMethod(hasEmail ? "link_email" : "kiosk");
    if (!hasPhone && waiverMethod === "sms") setWaiverMethod("device");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPhone, hasEmail]);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
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

    const missing: string[] = [];
    if (!mappedForm.firstName) missing.push("first name");
    if (!mappedForm.lastName) missing.push("last name");
    // DOB is COPPA-required for child mode only — owner decision 2026-07-12
    // drops it for adult walk-ins (see kiosk endpoint + resolvePerson trace).
    if (form.mode === "child" && !mappedForm.dob) missing.push("date of birth");
    if (form.mode === "adult" && !hasEmail) missing.push("email");
    if (form.mode === "child" && (!form.parentFirstName.trim() || !form.parentLastName.trim()))
      missing.push("parent name");
    if (form.mode === "child" && !hasEmail) missing.push("parent email");
    if (missing.length) {
      setSubmitError(`Missing: ${missing.join(", ")}.`);
      setBusy(false);
      return;
    }

    // Empty fields are handled above by the aggregated banner; this catches
    // format problems (malformed email, bad date) via the native validators
    // that noValidate on the <form> would otherwise silence entirely.
    const formEl = e.currentTarget;
    if (!formEl.checkValidity()) {
      setSubmitError("Some values look invalid — check the highlighted fields.");
      formEl.reportValidity();
      setBusy(false);
      return;
    }

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
        // Same rule as WalkInWizard: some responses put a machine code in
        // `error` and the human sentence in `message` (the class-rate 409).
        const human =
          typeof body.message === "string"
            ? body.message
            : typeof body.error === "string"
              ? body.error
              : null;
        setSubmitError(human ?? `Failed (${res.status})`);
        setBusy(false);
        return;
      }

      const bookingId: string = body.bookingId;
      let sent = false;

      // For link methods, attempt the real send-link call so the copy is true.
      if (payMethod === "link_email" || payMethod === "link_sms") {
        const channel = payMethod === "link_email" ? "email" : "sms";
        try {
          // kind MUST be "walkin_session" — that's the token kind
          // walkin/start.ts already minted for this booking (returned as
          // body.url below) and the ONLY kind /walkin/payment.ts accepts.
          // A "drop_in_booking"-kind token here would mint a DIFFERENT,
          // waiver/photo-only token that PayCard can never pay against.
          const sendRes = await fetch("/api/admin/check-in/send-link", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              kind: "walkin_session",
              targetId: bookingId,
              channel,
            }),
          });
          sent = sendRes.ok;
        } catch {
          // send-link failed — fall through to copy-fallback below
        }
      }

      setResult({
        url: body.url,
        amountDueCents: body.amountDueCents ?? 0,
        method: payMethod,
        sent,
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
                The booking is created and held for 2 hours. Hand the device
                to{" "}
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
              {result.sent ? (
                <>
                  <h3 className="text-lg font-bold text-[#1c1a17]">
                    Pay link sent
                  </h3>
                  <p className="text-sm text-[#4b463e] max-w-xs">
                    Sent the pay link to{" "}
                    <strong>
                      {form.firstName} {form.lastName}
                    </strong>{" "}
                    via{" "}
                    {result.method === "link_email"
                      ? form.mode === "child"
                        ? form.parentEmail
                          ? `email (${form.parentEmail})`
                          : "email"
                        : form.email
                          ? `email (${form.email})`
                          : "email"
                      : form.mode === "child"
                        ? form.parentPhone
                          ? `SMS (${form.parentPhone})`
                          : "SMS"
                        : form.phone
                          ? `SMS (${form.phone})`
                          : "SMS"}
                    . They can sign, add a photo, and pay{" "}
                    <strong>{amtStr}</strong> right from their phone — the
                    slot is held for 2 hours. If it&apos;s not paid by then,
                    it releases back to the schedule.
                  </p>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-bold text-amber-800">
                    Link NOT sent — share it manually
                  </h3>
                  <div
                    role="alert"
                    className="text-sm text-amber-900 max-w-xs bg-amber-50 border border-amber-200 rounded-lg px-3 py-2"
                  >
                    We couldn&apos;t {result.method === "link_sms" ? "text" : "email"} the
                    pay link
                    {result.method === "link_sms" && !hasPhone
                      ? " (no mobile number was entered)"
                      : ""}
                    . Copy it below and share it with{" "}
                    <strong>
                      {form.firstName} {form.lastName}
                    </strong>{" "}
                    — they can sign, add a photo, and pay{" "}
                    <strong>{amtStr}</strong> right from their phone. The slot
                    is held for 2 hours; if it&apos;s not paid by then, it
                    releases back to the schedule.
                  </div>
                </>
              )}
              <div className="w-full max-w-xs">
                <div className="flex items-center gap-2 border border-[#e4ddcf] rounded-lg px-3 py-2 bg-[#f6f1e7]">
                  <span className="flex-1 text-xs text-[#4b463e] break-all leading-tight">
                    {result.url}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard
                        .writeText(result.url)
                        .then(() => {
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        })
                        .catch(() =>
                          toast.error(
                            "Copy failed — long-press or select the link text to copy manually",
                          ),
                        );
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

      {/* noValidate: empty-field validation goes through the aggregated
          ErrorBanner in handleSubmit (native tooltips only show one field at a
          time); format validity is still checked via checkValidity() there. */}
      <form onSubmit={handleSubmit} noValidate className="flex-1 overflow-y-auto">
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
            <FieldLabel>
              Date of birth{form.mode === "adult" ? " (optional)" : ""}
            </FieldLabel>
            <TextInput
              value={form.dob}
              onChange={(v) => set("dob", v)}
              placeholder="YYYY-MM-DD"
              type="date"
              required={form.mode === "child"}
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
                <FieldLabel>Mobile (for pay link + receipt)</FieldLabel>
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
              onClick={() => hasPhone && setWaiverMethod("sms")}
              disabled={!hasPhone}
              className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors ${
                !hasPhone
                  ? "opacity-50 cursor-not-allowed border-[#e4ddcf] bg-[#f6f1e7] text-[#4b463e]"
                  : waiverMethod === "sms"
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
              Waiver link sent to their mobile after the booking is created.
            </p>
          )}
          {!hasPhone && (
            <p className="text-[11.5px] text-[#8a8175] mt-2">
              Add a mobile number above to text
            </p>
          )}
        </div>

        {/* ── Step 3: How they'll finish signing up ────────────────────────── */}
        <div className="px-4 py-4">
          <h4 className="flex items-center text-sm font-semibold text-[#1c1a17] mb-3">
            <StepBadge n={3} />
            How they&apos;ll finish signing up
          </h4>

          {/* Payment method cards */}
          <div className="space-y-2 mb-4">
            {(
              [
                {
                  method: "link_email" as PayMethod,
                  icon: "📧",
                  title: "Email a pay link",
                  subtitle:
                    "They sign, add a photo, and pay right from their phone — slot held for 2 hours",
                },
                {
                  method: "link_sms" as PayMethod,
                  icon: "📲",
                  title: "Text a pay link",
                  subtitle:
                    "They sign, add a photo, and pay right from their phone — slot held for 2 hours",
                },
                {
                  method: "kiosk" as PayMethod,
                  icon: "💳",
                  title: "Kiosk self-pay",
                  subtitle:
                    "Hand device to customer — they tap/insert card at the kiosk",
                },
              ] satisfies { method: PayMethod; icon: string; title: string; subtitle: string }[]
            ).map(({ method, icon, title, subtitle }) => {
              const disabled =
                method === "link_sms" ? !hasPhone : method === "link_email" ? !hasEmail : false;
              const displaySubtitle = disabled
                ? method === "link_sms"
                  ? "Add a mobile number above to text"
                  : "Add an email above to send"
                : subtitle;
              return (
                <button
                  key={method}
                  type="button"
                  onClick={() => !disabled && setPayMethod(method)}
                  disabled={disabled}
                  className={`w-full flex items-center gap-3 border rounded-xl px-3 py-2.5 text-left transition-shadow ${
                    disabled
                      ? "opacity-50 cursor-not-allowed border-[#e4ddcf] bg-[#fffdf8]"
                      : payMethod === method
                        ? "border-[#1c1a17] shadow-[0_0_0_2px_rgba(28,26,23,0.12)] bg-[#fffdf8]"
                        : "border-[#e4ddcf] bg-[#fffdf8] hover:border-[#4b463e]"
                  }`}
                >
                  <div className="w-9 h-9 rounded-lg bg-[#f6f1e7] flex items-center justify-center text-lg flex-shrink-0">
                    {icon}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-[13.5px] text-[#1c1a17]">{title}</div>
                    <div className="text-[11.5px] text-[#8a8175] truncate">
                      {displaySubtitle}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Submit error */}
          <ErrorBanner message={submitError} className="mb-3" />

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
                : payMethod === "link_email"
                  ? "Create booking & email pay link ›"
                  : "Create booking & text pay link ›"}
          </button>
          <p className="text-[11.5px] text-[#8a8175] text-center mt-2">
            On success: added to the roster, slot held for 2 hours or until paid.
          </p>
        </div>
      </form>
    </div>
  );
}
