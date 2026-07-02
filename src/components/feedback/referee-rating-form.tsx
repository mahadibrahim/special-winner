"use client";

import { useState } from "react";
import { ErrorBanner } from "@/components/ui/error-banner";

interface RefereeRatingFormProps {
  token: string;
  eventLabel: string | null;
  refereeName: string | null;
  onDone: () => void;
}

const DIMENSIONS = [
  { key: "gameControl", label: "Game control & safety" },
  { key: "communication", label: "Communication & professionalism" },
  { key: "fairness", label: "Fairness & consistency" },
] as const;

type DimensionKey = (typeof DIMENSIONS)[number]["key"];

export function RefereeRatingForm({ token, eventLabel, refereeName, onDone }: RefereeRatingFormProps) {
  const [overall, setOverall] = useState<number | null>(null);
  const [dims, setDims] = useState<Record<DimensionKey, number | null>>({
    gameControl: null,
    communication: null,
    fairness: null,
  });
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const complete = overall !== null && DIMENSIONS.every((d) => dims[d.key] !== null);

  async function submit() {
    if (!complete || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/feedback/${token}/referee`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          overall,
          gameControl: dims.gameControl,
          communication: dims.communication,
          fairness: dims.fairness,
          ...(comment.trim() ? { comment: comment.trim() } : {}),
        }),
      });
      if (!res.ok) {
        const jsonBody = await res.json().catch(() => ({}));
        setError(jsonBody.error ?? "Something went wrong — try again.");
        return;
      }
      onDone();
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border bg-white p-8 shadow-sm">
      <h1 className="mb-1 text-xl font-semibold">
        Rate {refereeName ?? "the referee"}
      </h1>
      {eventLabel && <p className="mb-4 text-muted-foreground">{eventLabel}</p>}
      <p className="mb-4 text-xs text-muted-foreground">
        Anonymous — goes only to league staff, never to the referee.
      </p>
      {error && <ErrorBanner message={error} />}

      <StarRow
        label="Overall"
        value={overall}
        onSelect={setOverall}
        testId="overall"
      />
      {DIMENSIONS.map((d) => (
        <StarRow
          key={d.key}
          label={d.label}
          value={dims[d.key]}
          onSelect={(v) => setDims((prev) => ({ ...prev, [d.key]: v }))}
          testId={d.key}
        />
      ))}

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        maxLength={2000}
        placeholder="Anything staff should know? (optional)"
        data-testid="referee-comment"
        className="mb-4 mt-2 w-full rounded-md border p-3"
      />
      <button
        onClick={submit}
        disabled={!complete || busy}
        data-testid="referee-submit"
        className="w-full rounded-md bg-primary px-4 py-3 font-medium text-primary-foreground disabled:opacity-50"
      >
        Submit rating
      </button>
    </div>
  );
}

function StarRow({
  label,
  value,
  onSelect,
  testId,
}: {
  label: string;
  value: number | null;
  onSelect: (v: number) => void;
  testId: string;
}) {
  return (
    <div className="mb-3">
      <div className="mb-1 text-sm font-medium">{label}</div>
      <div className="flex gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            onClick={() => onSelect(star)}
            aria-label={`${label}: ${star} of 5`}
            data-testid={`${testId}-star-${star}`}
            className={`rounded-md border px-3 py-2 text-lg ${
              value !== null && star <= value ? "bg-primary text-primary-foreground" : ""
            }`}
          >
            ★
          </button>
        ))}
      </div>
    </div>
  );
}
