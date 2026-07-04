"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, CheckCircle2 } from "lucide-react";
import { ErrorBanner } from "@/components/ui/error-banner";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import {
  jobApplicationSchema,
  APPLICATION_ROLES,
  APPLICATION_LOCATIONS,
  APPLICATION_AVAILABILITY,
} from "@/lib/careers/application-schema";

const ROLE_LABELS: Record<string, string> = {
  referee: "Referee",
  coach: "Coach",
  staff: "Other staff",
};
const LOCATION_LABELS: Record<string, string> = {
  worthington: "Worthington",
  downtown: "Downtown",
  either: "Either",
};
const AVAILABILITY_LABELS: Record<string, string> = {
  weeknights: "Weeknights",
  weekends: "Weekends",
  mornings: "Mornings",
};

type FormInput = z.input<typeof jobApplicationSchema>;
type FormValues = z.output<typeof jobApplicationSchema>;

const inputClass =
  "w-full px-3 py-2.5 bg-paper border border-ink/15 rounded-lg text-ink placeholder:text-ink-faint focus:outline-none focus:border-primary-orange transition-colors";

export default function ApplicationForm() {
  useHydrationBeacon();
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [resume, setResume] = useState<File | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(jobApplicationSchema),
    defaultValues: { availability: [] },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    const fd = new FormData();
    for (const [k, v] of Object.entries(values)) {
      if (v == null || v === "") continue;
      if (Array.isArray(v)) v.forEach((item) => fd.append(k, item));
      else fd.append(k, String(v));
    }
    if (resume) fd.append("resume", resume);
    if (turnstileToken) fd.append("turnstileToken", turnstileToken);

    const res = await fetch("/api/public/careers/apply", { method: "POST", body: fd });
    if (res.ok) {
      setSubmitted(true);
      return;
    }
    const body = await res.json().catch(() => ({}));
    setServerError(body.error ?? "Something went wrong. Please email hello@aspiresportsohio.com.");
  }

  if (submitted) {
    return (
      <div className="bg-cream-2 border border-primary-orange/30 rounded-2xl p-8">
        <div className="flex items-start gap-4">
          <CheckCircle2 className="w-6 h-6 text-primary-orange flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="font-display text-2xl text-ink mb-2">Application received.</h2>
            <p className="text-ink-2 leading-relaxed">
              Thanks for applying — we review every application and will reach out by email. If
              anything's urgent, email{" "}
              <a href="mailto:hello@aspiresportsohio.com" className="text-primary-orange hover:underline">
                hello@aspiresportsohio.com
              </a>
              .
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {serverError && <ErrorBanner message={serverError} />}

      <Field label="I'm applying as" required>
        <select id="role" {...register("role")} className={inputClass}>
          <option value="">Select a role…</option>
          {APPLICATION_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        {errors.role && <FieldError>Please pick a role.</FieldError>}
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="First name" required>
          <input id="firstName" {...register("firstName")} className={inputClass} />
          {errors.firstName && <FieldError>Required.</FieldError>}
        </Field>
        <Field label="Last name" required>
          <input id="lastName" {...register("lastName")} className={inputClass} />
          {errors.lastName && <FieldError>Required.</FieldError>}
        </Field>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Email" required>
          <input id="email" type="email" {...register("email")} className={inputClass} />
          {errors.email && <FieldError>A valid email is required.</FieldError>}
        </Field>
        <Field label="Phone (optional)">
          <input id="phone" type="tel" {...register("phone")} className={inputClass} />
        </Field>
      </div>

      <Field label="Preferred facility">
        <select id="preferredLocation" {...register("preferredLocation")} className={inputClass}>
          <option value="">No preference</option>
          {APPLICATION_LOCATIONS.map((l) => (
            <option key={l} value={l}>
              {LOCATION_LABELS[l]}
            </option>
          ))}
        </select>
      </Field>

      <fieldset>
        <legend className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted block mb-2">
          Availability
        </legend>
        <div className="flex flex-wrap gap-4">
          {APPLICATION_AVAILABILITY.map((a) => (
            <label key={a} className="flex items-center gap-2 text-sm text-ink-2">
              <input type="checkbox" value={a} {...register("availability")} />
              {AVAILABILITY_LABELS[a]}
            </label>
          ))}
        </div>
      </fieldset>

      <Field label="Certifications" hint="ref grade, coaching badges…">
        <input id="certifications" {...register("certifications")} className={inputClass} />
      </Field>

      <Field label="Tell us about your experience" required>
        <textarea
          id="experience"
          rows={4}
          {...register("experience")}
          className={`${inputClass} resize-y`}
        />
        {errors.experience && <FieldError>Required.</FieldError>}
      </Field>

      <Field label="Resume" hint="optional, PDF up to 5 MB">
        <input
          id="resume"
          type="file"
          accept="application/pdf"
          className="block w-full text-sm text-ink-2"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            if (f && (f.type !== "application/pdf" || f.size > 5 * 1024 * 1024)) {
              setResumeError("Resume must be a PDF up to 5 MB.");
              setResume(null);
              e.target.value = "";
              return;
            }
            setResumeError(null);
            setResume(f);
          }}
        />
        {resumeError && <FieldError>{resumeError}</FieldError>}
      </Field>

      <Field label="How did you hear about us?">
        <input id="source" {...register("source")} className={inputClass} />
      </Field>

      <TurnstileWidget onToken={(t) => setTurnstileToken(t)} onError={() => setTurnstileToken(null)} />

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-ink text-cream text-sm font-medium tracking-wide uppercase hover:bg-primary-orange transition-colors disabled:opacity-60"
        style={{ letterSpacing: "0.08em" }}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Submitting…
          </>
        ) : (
          "Submit application →"
        )}
      </button>
    </form>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted block mb-2">
        {label}
        {required && <span className="text-primary-orange ml-1">*</span>}
        {hint && <span className="normal-case tracking-normal font-normal text-ink-faint"> ({hint})</span>}
      </span>
      {children}
    </label>
  );
}

function FieldError({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-xs text-red-500">{children}</p>;
}
