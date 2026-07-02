"use client";

import { useState } from "react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { ErrorBanner } from "@/components/ui/error-banner";
import { RefereeRatingForm } from "@/components/feedback/referee-rating-form";
import type { FeedbackRequestKind } from "@/lib/db/schema";

interface FeedbackFormProps {
  token: string;
  state: "open" | "responded" | "expired" | "not_found";
  kind: FeedbackRequestKind | null;
  eventLabel: string | null;
  refereeName: string | null;
}

type Category = "promoter" | "passive" | "detractor";

export function FeedbackForm(props: FeedbackFormProps) {
  useHydrationBeacon();

  if (props.state === "not_found") {
    return (
      <TerminalCard
        title="This link isn't valid"
        body="Double-check the link from your email, or reach out to us directly."
      />
    );
  }
  if (props.state === "expired") {
    return (
      <TerminalCard
        title="This link has expired"
        body="Feedback links are open for a limited time after the event. We'd still love to hear from you — just reply to the email we sent."
      />
    );
  }
  if (props.state === "responded") {
    return (
      <TerminalCard title="Thanks — you're all set" body="You've already shared your feedback for this one." />
    );
  }

  if (props.kind === "referee_rating") {
    return (
      <RefereeBranch
        token={props.token}
        eventLabel={props.eventLabel}
        refereeName={props.refereeName}
      />
    );
  }

  return <NpsForm token={props.token} eventLabel={props.eventLabel} />;
}

function RefereeBranch({
  token,
  eventLabel,
  refereeName,
}: {
  token: string;
  eventLabel: string | null;
  refereeName: string | null;
}) {
  const [done, setDone] = useState(false);
  if (done) {
    return (
      <TerminalCard
        title="Thank you!"
        body="Your rating helps us keep officiating quality high."
      />
    );
  }
  return (
    <RefereeRatingForm
      token={token}
      eventLabel={eventLabel}
      refereeName={refereeName}
      onDone={() => setDone(true)}
    />
  );
}

function TerminalCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border bg-white p-8 text-center shadow-sm">
      <h1 className="mb-2 text-xl font-semibold">{title}</h1>
      <p className="text-muted-foreground">{body}</p>
    </div>
  );
}

function NpsForm({ token, eventLabel }: { token: string; eventLabel: string | null }) {
  const [phase, setPhase] = useState<"score" | "followup" | "done">("score");
  const [category, setCategory] = useState<Category | null>(null);
  const [reviewUrl, setReviewUrl] = useState<string | null>(null);
  const [selectedScore, setSelectedScore] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submitScore(score: number) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setSelectedScore(score);
    try {
      const res = await fetch(`/api/feedback/${token}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Something went wrong — try again.");
        setSelectedScore(null);
        return;
      }
      setCategory(json.category);
      setReviewUrl(json.reviewUrl);
      setPhase("followup");
    } catch {
      setError("Network error — try again.");
      setSelectedScore(null);
    } finally {
      setBusy(false);
    }
  }

  async function submitComment() {
    if (!comment.trim()) {
      setPhase("done");
      return;
    }
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/feedback/${token}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: comment.trim() }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        setError(json?.error ?? "Couldn't send your comment — try again.");
        return; // stay on the followup phase so the user can retry
      }
      setPhase("done");
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  function clickReview() {
    // Fire-and-forget tracking; navigation happens via the anchor itself.
    void fetch(`/api/feedback/${token}/review-click`, { method: "POST" });
  }

  if (phase === "done") {
    return (
      <TerminalCard
        title="Thank you!"
        body="Your feedback goes straight to the people who run the program."
      />
    );
  }

  if (phase === "followup") {
    return (
      <div className="rounded-lg border bg-white p-8 shadow-sm">
        {category === "promoter" ? (
          <>
            <h1 className="mb-2 text-xl font-semibold">That's great to hear! 🎉</h1>
            {reviewUrl ? (
              <>
                <p className="mb-4 text-muted-foreground">
                  Would you take 30 seconds to say so publicly? It helps other
                  families find us.
                </p>
                <a
                  href={reviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={clickReview}
                  data-testid="review-cta"
                  className="mb-6 inline-block w-full rounded-md bg-primary px-4 py-3 text-center font-medium text-primary-foreground"
                >
                  Review us on Google
                </a>
              </>
            ) : (
              <p className="mb-4 text-muted-foreground">Thanks for being part of it.</p>
            )}
          </>
        ) : (
          <h1 className="mb-4 text-xl font-semibold">Thanks — what could we do better?</h1>
        )}
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder={
            category === "promoter"
              ? "Anything else you want to share? (optional)"
              : "Tell us what would have made it better (optional)"
          }
          data-testid="comment-box"
          className="mb-4 w-full rounded-md border p-3"
        />
        {error && <ErrorBanner message={error} className="mb-4" />}
        <button
          onClick={submitComment}
          disabled={busy}
          data-testid="finish-button"
          className="w-full rounded-md border px-4 py-3 font-medium"
        >
          {comment.trim() ? "Send feedback" : "Finish"}
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white p-8 shadow-sm">
      <h1 className="mb-1 text-xl font-semibold">How was it?</h1>
      {eventLabel && <p className="mb-4 text-muted-foreground">{eventLabel}</p>}
      <p className="mb-3 text-sm font-medium">
        How likely are you to recommend us to a friend?
      </p>
      {error && <ErrorBanner message={error} />}
      <div className="grid grid-cols-11 gap-1" role="radiogroup" aria-label="Score from 0 to 10">
        {Array.from({ length: 11 }, (_, score) => (
          <button
            key={score}
            onClick={() => submitScore(score)}
            disabled={busy}
            aria-label={`Score ${score}`}
            data-testid={`score-${score}`}
            className={`rounded-md border py-3 text-sm font-medium hover:bg-accent ${
              selectedScore === score ? "bg-primary text-primary-foreground" : ""
            }`}
          >
            {score}
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-muted-foreground">
        <span>Not likely</span>
        <span>Very likely</span>
      </div>
    </div>
  );
}
