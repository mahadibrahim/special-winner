"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { TypeStep } from "./TypeStep";
import { DetailsStep, type OfferingDraft } from "./DetailsStep";
import { OFFERING_TYPES, type OfferingType } from "@/lib/admin/offering-types";
import { draftToOfferingPayload } from "@/lib/admin/offering-draft-to-payload";

const EMPTY: OfferingDraft = {
  name: "", slug: "", startDate: "", endDate: "", dailyStartTime: "", dailyEndTime: "",
  fullDayPrice: "", halfDayPrice: "", individualPrice: "", teamPrice: "",
  minAge: "", maxAge: "", capacity: "", deposit: "", divisionGender: "", skillLevel: "",
  audience: "youth",
};

export function OfferingWizard({
  locationId,
  sportId,
  onDone,
}: {
  locationId: string;
  sportId: string;
  onDone: () => void;
}) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [type, setType] = useState<OfferingType | null>(null);
  const [draft, setDraft] = useState<OfferingDraft>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(publish: boolean) {
    if (!type) return;
    setBusy(true);
    setError(null);
    try {
      const payload = draftToOfferingPayload(type, draft, { locationId, sportId, publish });
      const res = await fetch("/api/admin/offerings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error((b as { error?: string }).error ?? "Failed to create offering");
      }
      onDone();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {error && <ErrorBanner message={error} />}

      {step === 1 && (
        <>
          <h2 className="font-display text-2xl">What are you creating?</h2>
          <TypeStep
            value={type}
            audience={draft.audience}
            onSelect={setType}
            onAudience={(a) => setDraft((d) => ({ ...d, audience: a }))}
          />
          <Button disabled={!type} onClick={() => setStep(2)}>Next</Button>
        </>
      )}

      {step === 2 && type && (
        <>
          <h2 className="font-display text-2xl">{OFFERING_TYPES[type].label} details</h2>
          <DetailsStep type={type} value={draft} onChange={setDraft} />
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
            <Button onClick={() => setStep(3)}>Review</Button>
          </div>
        </>
      )}

      {step === 3 && type && (
        <>
          <h2 className="font-display text-2xl">Review</h2>
          <p className="text-ink-muted">{OFFERING_TYPES[type].label}: {draft.name} ({draft.startDate} – {draft.endDate})</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
            <Button variant="outline" disabled={busy} onClick={() => submit(false)}>Save as draft</Button>
            <Button disabled={busy} onClick={() => submit(true)}>Publish now</Button>
          </div>
        </>
      )}
    </div>
  );
}
