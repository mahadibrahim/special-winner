"use client";

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import type { UseFormRegisterReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, CheckCircle2 } from "lucide-react";
import { ErrorBanner } from "@/components/ui/error-banner";
import { TurnstileWidget } from "@/components/auth/turnstile-widget";
import type { TurnstileWidgetHandle } from "@/components/auth/turnstile-widget";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import {
  jobApplicationSchema,
  APPLICATION_ROLES,
  APPLICATION_LOCATIONS,
  APPLICATION_AVAILABILITY,
  APPLICATION_GAMES_PLAYED,
} from "@/lib/careers/application-schema";

const ROLE_LABELS: Record<string, string> = {
  referee: "Referee",
  coach: "Coach",
  staff: "Other staff",
  host: "Pickup Host",
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
const GAMES_PLAYED_LABELS: Record<string, string> = {
  "0": "Never played",
  "1-3": "1–3 times",
  "3-5": "3–5 times",
  "5+": "5+ times",
};

type FormInput = z.input<typeof jobApplicationSchema>;
type FormValues = z.output<typeof jobApplicationSchema>;

// Host media upload kinds — mirror HOST_UPLOAD_LIMITS in the upload-url endpoint.
type UploadKind = "photo" | "motivation_video" | "demo_video";
type HostMediaState = Record<UploadKind, { key: string | null; uploading: boolean; error: string | null }>;

const HOST_MEDIA_FIELD: Record<UploadKind, "photoKey" | "motivationVideoKey" | "demoVideoKey"> = {
  photo: "photoKey",
  motivation_video: "motivationVideoKey",
  demo_video: "demoVideoKey",
};

const EMPTY_HOST_MEDIA: HostMediaState = {
  photo: { key: null, uploading: false, error: null },
  motivation_video: { key: null, uploading: false, error: null },
  demo_video: { key: null, uploading: false, error: null },
};

const inputClass =
  "w-full px-3 py-2.5 bg-paper border border-ink/15 rounded-lg text-ink placeholder:text-ink-faint focus:outline-none focus:border-primary-orange transition-colors";

/** Signals the upload-url endpoint returned 503 storage_unavailable — the caller degrades to link inputs rather than showing a per-field error. */
class StorageUnavailableError extends Error {}

async function uploadHostMedia(
  kind: UploadKind,
  file: File,
  turnstileToken: string | null,
): Promise<string> {
  const res = await fetch("/api/public/careers/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind,
      contentType: file.type,
      sizeBytes: file.size,
      turnstileToken,
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 503 && body.code === "storage_unavailable") {
      throw new StorageUnavailableError(body.error ?? "Uploads unavailable");
    }
    throw new Error(body.error ?? "Could not start the upload");
  }
  const { url, key } = await res.json();
  const put = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file,
  });
  if (!put.ok) throw new Error("Upload failed — please try again");
  return key;
}

export default function ApplicationForm() {
  useHydrationBeacon();
  const turnstileRef = useRef<TurnstileWidgetHandle | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [resume, setResume] = useState<File | null>(null);
  const [resumeError, setResumeError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [hostMedia, setHostMedia] = useState<HostMediaState>(EMPTY_HOST_MEDIA);
  const [linksMode, setLinksMode] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(jobApplicationSchema),
    defaultValues: { availability: [] },
  });

  const isHost = watch("role") === "host";

  function handleHostFile(kind: UploadKind) {
    return async (file: File) => {
      setHostMedia((prev) => ({ ...prev, [kind]: { key: null, uploading: true, error: null } }));
      try {
        const key = await uploadHostMedia(kind, file, turnstileToken);
        // Turnstile tokens are single-use — the upload-url call above just
        // spent this one. Re-solve now so a fresh token is ready for the
        // next media upload or the final application submit (there's
        // usually a comfortable gap here while the applicant records/picks
        // the next file, so the invisible re-solve has time to land).
        turnstileRef.current?.reset();
        setHostMedia((prev) => ({ ...prev, [kind]: { key, uploading: false, error: null } }));
        setValue(HOST_MEDIA_FIELD[kind], key, { shouldValidate: true, shouldDirty: true });
      } catch (err) {
        if (err instanceof StorageUnavailableError) {
          // Degrade every media field to a link input — a single flip, not per-field.
          setLinksMode(true);
          setHostMedia((prev) => ({ ...prev, [kind]: { key: null, uploading: false, error: null } }));
        } else {
          const message = err instanceof Error ? err.message : "Upload failed — please try again";
          setHostMedia((prev) => ({ ...prev, [kind]: { key: null, uploading: false, error: message } }));
        }
      }
    };
  }

  async function onSubmit(values: FormValues) {
    setServerError(null);

    if (values.role === "host") {
      const stillUploading = (Object.keys(hostMedia) as UploadKind[]).some(
        (kind) => hostMedia[kind].uploading,
      );
      if (stillUploading) {
        setServerError("Please wait for uploads to finish before submitting.");
        return;
      }
    }

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
        <Field label="Phone" required={isHost} hint={isHost ? undefined : "optional"}>
          <input id="phone" type="tel" {...register("phone")} className={inputClass} />
          {errors.phone && <FieldError>{errors.phone.message}</FieldError>}
        </Field>
      </div>

      {isHost && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Date of birth" required>
              <input
                id="dateOfBirth"
                type="date"
                {...register("dateOfBirth", { setValueAs: (v) => (v === "" ? undefined : v) })}
                className={inputClass}
              />
              {errors.dateOfBirth && <FieldError>{errors.dateOfBirth.message}</FieldError>}
            </Field>
            <Field label="Games you've played" required>
              <select
                id="gamesPlayed"
                {...register("gamesPlayed", { setValueAs: (v) => (v === "" ? undefined : v) })}
                className={inputClass}
              >
                <option value="">Select…</option>
                {APPLICATION_GAMES_PLAYED.map((g) => (
                  <option key={g} value={g}>
                    {GAMES_PLAYED_LABELS[g]}
                  </option>
                ))}
              </select>
              {errors.gamesPlayed && <FieldError>{errors.gamesPlayed.message}</FieldError>}
            </Field>
          </div>

          <fieldset>
            <legend className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted block mb-2">
              Can you commit to hosting at least once a week?
              <span className="text-primary-orange ml-1">*</span>
            </legend>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm text-ink-2">
                <input type="radio" value="yes" {...register("weeklyCommitment")} />
                Yes
              </label>
              <label className="flex items-center gap-2 text-sm text-ink-2">
                <input type="radio" value="no" {...register("weeklyCommitment")} />
                No
              </label>
            </div>
            {errors.weeklyCommitment && <FieldError>{errors.weeklyCommitment.message}</FieldError>}
          </fieldset>
        </>
      )}

      <Field label="Preferred facility">
        <select id="preferredLocation" {...register("preferredLocation", { setValueAs: (v) => (v === "" ? undefined : v) })} className={inputClass}>
          <option value="">No preference</option>
          {APPLICATION_LOCATIONS.map((l) => (
            <option key={l} value={l}>
              {LOCATION_LABELS[l]}
            </option>
          ))}
        </select>
        {errors.preferredLocation && <FieldError>Please choose a facility or leave "No preference".</FieldError>}
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

      <Field label={isHost ? "Bio — 3–4 sentences, this is shown to players" : "Tell us about your experience"} required>
        <textarea
          id="experience"
          rows={4}
          {...register("experience")}
          className={`${inputClass} resize-y`}
        />
        {errors.experience && <FieldError>Required.</FieldError>}
      </Field>

      {isHost && (
        <>
          {linksMode && (
            <p className="text-sm text-ink-2 bg-cream-2 border border-ink/10 rounded-lg p-3">
              We couldn't reach our upload storage from here — paste links instead (YouTube, Loom,
              Drive, etc.).
            </p>
          )}
          <HostMediaField
            label="Photo"
            hint="A clear, friendly photo of you — this is what players see."
            accept="image/jpeg,image/png,image/webp"
            media={hostMedia.photo}
            linksMode={linksMode}
            linkProps={register("photoKey")}
            onFile={handleHostFile("photo")}
          />
          {errors.photoKey && <FieldError>{errors.photoKey.message}</FieldError>}

          <HostMediaField
            label="Motivation video"
            hint="1–2 minutes: why do you want to host, and how would you handle a heated argument between players?"
            accept="video/mp4,video/quicktime,video/webm"
            media={hostMedia.motivation_video}
            linksMode={linksMode}
            linkProps={register("motivationVideoKey")}
            onFile={handleHostFile("motivation_video")}
          />
          {errors.motivationVideoKey && <FieldError>{errors.motivationVideoKey.message}</FieldError>}

          <HostMediaField
            label="Demo video"
            hint="Film yourself greeting a group and explaining the game rules — like it's game day."
            accept="video/mp4,video/quicktime,video/webm"
            media={hostMedia.demo_video}
            linksMode={linksMode}
            linkProps={register("demoVideoKey")}
            onFile={handleHostFile("demo_video")}
          />
          {errors.demoVideoKey && <FieldError>{errors.demoVideoKey.message}</FieldError>}
        </>
      )}

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

      <TurnstileWidget
        ref={turnstileRef}
        onToken={(t) => setTurnstileToken(t)}
        onError={() => setTurnstileToken(null)}
      />

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-ink text-cream text-sm font-medium tracking-wide uppercase hover:bg-primary-bright hover:text-primary-foreground transition-colors disabled:opacity-60"
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

/**
 * Host-only media field. Renders a direct-upload file input by default; once
 * `linksMode` is on (upload-url returned 503 storage_unavailable), renders a
 * plain URL text input bound to the same form field instead — the schema's
 * `hostMediaKey` union accepts either an R2 key or an https:// link.
 */
function HostMediaField({
  label,
  hint,
  accept,
  media,
  linksMode,
  linkProps,
  onFile,
}: {
  label: string;
  hint: string;
  accept: string;
  media: { key: string | null; uploading: boolean; error: string | null };
  linksMode: boolean;
  linkProps: UseFormRegisterReturn;
  onFile: (file: File) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted block mb-1">
        {label}
        <span className="text-primary-orange ml-1">*</span>
      </span>
      <p className="text-xs text-ink-faint mb-2">{hint}</p>
      {linksMode ? (
        media.key ? (
          // Already uploaded before storage went down — keep the key and leave
          // the success state alone rather than swapping in a stale-prefilled
          // URL input the user could accidentally clear.
          <p className="mt-1.5 text-xs text-primary-orange">Uploaded ✓</p>
        ) : (
          <input
            type="url"
            placeholder="https://… (YouTube, Loom, or Drive)"
            {...linkProps}
            className={inputClass}
          />
        )
      ) : (
        <>
          <input
            type="file"
            accept={accept}
            disabled={media.uploading}
            className="block w-full text-sm text-ink-2"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
            }}
          />
          {media.uploading && <p className="mt-1.5 text-xs text-ink-faint">Uploading…</p>}
          {media.key && !media.uploading && (
            <p className="mt-1.5 text-xs text-primary-orange">Uploaded ✓</p>
          )}
        </>
      )}
      {media.error && <FieldError>{media.error}</FieldError>}
    </label>
  );
}
