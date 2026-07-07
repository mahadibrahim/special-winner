"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, CheckCircle2, Search } from "lucide-react";
import { ErrorBanner } from "@/components/ui/error-banner";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import {
  createIncidentSchema,
  incidentTypeValues,
  type IncidentSubjectInput,
} from "@/lib/incidents/incident-schema";
import type {
  IncidentFormGameOption,
  IncidentFormVenueOption,
} from "@/lib/incidents/incident-form-data";

const INCIDENT_TYPE_LABELS: Record<(typeof incidentTypeValues)[number], string> = {
  injury: "Injury",
  altercation: "Altercation",
  medical_event: "Medical event",
  property_damage: "Property damage",
  other: "Other",
};

// The subject is managed as component state rather than a nested
// react-hook-form field — a discriminated union nested under one form
// field fights react-hook-form's typed paths more than it's worth for a
// fast-capture mobile form. The flat fields still validate against
// createIncidentSchema (minus `subject`) via zodResolver, and the full
// payload — flat fields + the locally-managed subject — is re-validated
// against the same shared createIncidentSchema right before POST, so the
// form and the API never drift on what's valid.
const flatSchema = createIncidentSchema.omit({ subject: true });
type FlatInput = z.input<typeof flatSchema>;
type FlatValues = z.output<typeof flatSchema>;

type SubjectMode = "participant" | "bystander" | "staff" | "other";

interface ParticipantOption {
  id: string;
  firstName: string;
  lastName: string;
}

const inputClass =
  "w-full px-3 py-2.5 bg-paper border border-ink/15 rounded-lg text-ink placeholder:text-ink-faint focus:outline-none focus:border-primary-orange transition-colors";

export function IncidentReportForm({
  venues,
  games,
}: {
  venues: IncidentFormVenueOption[];
  games: IncidentFormGameOption[];
}) {
  useHydrationBeacon();

  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const [subjectMode, setSubjectMode] = useState<SubjectMode>("participant");
  const [participantQuery, setParticipantQuery] = useState("");
  const [participantResults, setParticipantResults] = useState<ParticipantOption[]>([]);
  const [selectedParticipant, setSelectedParticipant] = useState<ParticipantOption | null>(null);
  const [freeTextName, setFreeTextName] = useState("");
  const [subjectError, setSubjectError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FlatInput, unknown, FlatValues>({
    resolver: zodResolver(flatSchema),
    defaultValues: {
      incidentType: "injury",
      emergencyServicesCalled: false,
      suspectedConcussion: false,
      parentNotifiedOnsite: false,
    },
  });

  const selectedVenueId = watch("venueId");
  const suspectedConcussion = watch("suspectedConcussion");

  const gamesAtVenue = useMemo(
    () => games.filter((g) => !selectedVenueId || g.venueId === selectedVenueId),
    [games, selectedVenueId],
  );

  // Debounced participant search — mirrors the kiosk search's ≥2-char gate
  // on the server, but debounce client-side so we don't fire a request per
  // keystroke.
  useEffect(() => {
    if (subjectMode !== "participant" || participantQuery.trim().length < 2) {
      setParticipantResults([]);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/staff/incidents/participants?q=${encodeURIComponent(participantQuery)}`,
        );
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setParticipantResults(json.participants ?? []);
      } catch {
        // Silent — search is a convenience; the user can still retype.
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [participantQuery, subjectMode]);

  function buildSubject(): IncidentSubjectInput | null {
    if (subjectMode === "participant") {
      if (!selectedParticipant) return null;
      return { subjectType: "participant", familyMemberId: selectedParticipant.id };
    }
    if (!freeTextName.trim()) return null;
    return { subjectType: subjectMode, freeTextName: freeTextName.trim() };
  }

  async function onSubmit(values: FlatValues) {
    setServerError(null);
    setSubjectError(null);

    const subject = buildSubject();
    if (!subject) {
      setSubjectError(
        subjectMode === "participant"
          ? "Search for and select the participant this is about."
          : "Enter a name.",
      );
      return;
    }

    const payload = { ...values, subject };
    const parsed = createIncidentSchema.safeParse(payload);
    if (!parsed.success) {
      setServerError("Please check the form for errors and try again.");
      return;
    }

    const res = await fetch("/api/staff/incidents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });

    if (res.ok) {
      setSubmitted(true);
      return;
    }
    const body = await res.json().catch(() => ({}));
    setServerError(body.error ?? "Something went wrong. Please try again.");
  }

  if (submitted) {
    return (
      <div className="bg-cream-2 border border-primary-orange/30 rounded-2xl p-8">
        <div className="flex items-start gap-4">
          <CheckCircle2 className="w-6 h-6 text-primary-orange flex-shrink-0 mt-0.5" />
          <div>
            <h2 className="font-display text-2xl text-ink mb-2">Incident report submitted.</h2>
            <p className="text-ink-2 leading-relaxed">
              This is the fast, in-the-moment record. A full finalized report still needs to
              follow before this is closed out.
            </p>
            <button
              type="button"
              onClick={() => setSubmitted(false)}
              className="mt-4 inline-flex items-center justify-center px-5 py-2.5 bg-ink text-cream text-sm font-medium tracking-wide uppercase hover:bg-primary-orange transition-colors"
              style={{ letterSpacing: "0.08em" }}
            >
              File another incident
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {serverError && <ErrorBanner message={serverError} />}

      <Field label="Type of incident" required>
        <select id="incidentType" {...register("incidentType")} className={inputClass}>
          {incidentTypeValues.map((t) => (
            <option key={t} value={t}>
              {INCIDENT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
        {errors.incidentType && <FieldError>Please pick a type.</FieldError>}
      </Field>

      <Field label="Venue" required>
        <select id="venueId" {...register("venueId")} className={inputClass}>
          <option value="">Select a venue…</option>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        {errors.venueId && <FieldError>Please select a venue.</FieldError>}
      </Field>

      <Field label="Game (optional)" hint="if this happened during a scheduled game">
        <select
          id="gameId"
          {...register("gameId", { setValueAs: (v) => (v === "" ? undefined : v) })}
          className={inputClass}
        >
          <option value="">No specific game</option>
          {gamesAtVenue.map((g) => (
            <option key={g.id} value={g.id}>
              {(g.homeTeamName ?? "TBD") + " vs " + (g.awayTeamName ?? "TBD")} —{" "}
              {new Date(g.scheduledAt).toLocaleString()}
            </option>
          ))}
        </select>
      </Field>

      <fieldset className="space-y-3">
        <legend className="text-[11px] font-semibold tracking-[0.15em] uppercase text-ink-muted block mb-2">
          Who is this about?
        </legend>
        <div className="flex flex-wrap gap-4">
          {(["participant", "bystander", "staff", "other"] as SubjectMode[]).map((mode) => (
            <label key={mode} className="flex items-center gap-2 text-sm text-ink-2">
              <input
                type="radio"
                name="subjectMode"
                checked={subjectMode === mode}
                onChange={() => {
                  setSubjectMode(mode);
                  setSubjectError(null);
                }}
              />
              {mode === "participant" ? "Registered participant" : capitalize(mode)}
            </label>
          ))}
        </div>

        {subjectMode === "participant" ? (
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint" />
              <input
                type="text"
                value={selectedParticipant ? `${selectedParticipant.firstName} ${selectedParticipant.lastName}` : participantQuery}
                onChange={(e) => {
                  setSelectedParticipant(null);
                  setParticipantQuery(e.target.value);
                }}
                placeholder="Search by name…"
                className={`${inputClass} pl-9`}
              />
            </div>
            {!selectedParticipant && participantResults.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full bg-paper border border-ink/15 rounded-lg shadow-md max-h-56 overflow-y-auto">
                {participantResults.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-cream-2 text-sm text-ink"
                      onClick={() => {
                        setSelectedParticipant(p);
                        setParticipantResults([]);
                      }}
                    >
                      {p.firstName} {p.lastName}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <input
            type="text"
            value={freeTextName}
            onChange={(e) => setFreeTextName(e.target.value)}
            placeholder="Name"
            className={inputClass}
          />
        )}
        {subjectError && <FieldError>{subjectError}</FieldError>}
      </fieldset>

      <Field label="Time observed" required>
        <input
          id="occurredAt"
          type="datetime-local"
          {...register("occurredAt", {
            setValueAs: (v) => (v ? new Date(v).toISOString() : v),
          })}
          className={inputClass}
        />
        {errors.occurredAt && <FieldError>Required.</FieldError>}
      </Field>

      <Field label="People involved" required>
        <textarea id="peopleInvolved" rows={2} {...register("peopleInvolved")} className={`${inputClass} resize-y`} />
        {errors.peopleInvolved && <FieldError>Required.</FieldError>}
      </Field>

      <Field label="First responder (who attended first)" required>
        <input id="firstResponderName" {...register("firstResponderName")} className={inputClass} />
        {errors.firstResponderName && <FieldError>Required.</FieldError>}
      </Field>

      <Field label="Immediate care given" required>
        <textarea
          id="immediateCareGiven"
          rows={3}
          {...register("immediateCareGiven")}
          className={`${inputClass} resize-y`}
        />
        {errors.immediateCareGiven && <FieldError>Required.</FieldError>}
      </Field>

      <label className="flex items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" {...register("emergencyServicesCalled")} />
        911 / emergency services called?
      </label>

      <Field label="Time emergency services were called" hint="if applicable">
        <input
          id="emergencyServicesCallTime"
          type="datetime-local"
          {...register("emergencyServicesCallTime", {
            setValueAs: (v) => (v ? new Date(v).toISOString() : null),
          })}
          className={inputClass}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" {...register("suspectedConcussion")} />
        Suspected concussion?
      </label>

      {suspectedConcussion && (
        <div className="rounded-lg border border-primary-orange/30 bg-cream-2 p-4 space-y-2">
          <p className="text-sm text-ink-2 leading-relaxed">
            Ohio law (ORC 3707.511) requires immediate removal from play for any athlete under
            19 with a suspected concussion — no return to play the same day, and no return to
            any Aspire activity without written clearance from a physician or an
            Ohio-authorized licensed health-care provider.
          </p>
          <label className="flex items-center gap-2 text-sm text-ink-2">
            <input type="checkbox" {...register("removedFromPlay")} />
            Athlete removed from play immediately (no same-day return)
          </label>
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-ink-2">
        <input type="checkbox" {...register("parentNotifiedOnsite")} />
        Parent notified on-site?
      </label>

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex items-center justify-center gap-2 px-7 py-3.5 bg-ink text-cream text-sm font-medium tracking-wide uppercase hover:bg-primary-orange transition-colors disabled:opacity-60 w-full"
        style={{ letterSpacing: "0.08em" }}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Submitting…
          </>
        ) : (
          "Submit incident report"
        )}
      </button>
    </form>
  );
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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
