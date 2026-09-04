"use client";

import { useState } from "react";
import type { BrandId } from "@/lib/branding/themes";
import {
  CAPTURE_INCENTIVE,
  JOIN_PAGE_SOURCE,
  formatIncentiveAmount,
} from "@/lib/marketing/capture-incentive";
import { track } from "@/lib/analytics/track";
import { ErrorBanner } from "@/components/ui/error-banner";

interface JoinEmailCardProps {
  brand: BrandId;
  /** Flyer campaign tag from the QR URL (?src=…), forwarded for attribution. */
  src?: string;
}

export function JoinEmailCard({ brand, src }: JoinEmailCardProps) {
  const amount = formatIncentiveAmount(CAPTURE_INCENTIVE.amountCents);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "ok" | "error">(
    "idle",
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setStatus("submitting");
    try {
      const res = await fetch("/api/public/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          source: JOIN_PAGE_SOURCE,
          brand,
          src,
        }),
      });
      if (!res.ok) throw new Error();
      setStatus("ok");
      track("join_email_submitted", { brand, src });
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="rounded-2xl border border-ink/10 bg-paper p-5 shadow-sm">
      <h2 className="font-display text-lg text-ink">
        ✉️ Email list · {amount} off
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        Codes, schedules, and first dibs on registration.
      </p>

      {status === "ok" ? (
        <p className="mt-4 text-sm font-medium text-ink" role="status">
          You're on the list — check your email for your {amount} code.
        </p>
      ) : (
        <form onSubmit={submit} className="mt-4 flex flex-col gap-2">
          <label htmlFor="join-email" className="sr-only">
            Email address
          </label>
          <input
            id="join-email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={status === "submitting"}
            className="w-full rounded-lg border border-ink/20 bg-cream px-4 py-3 text-sm text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary/60 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={status === "submitting"}
            className="rounded-lg bg-primary-bright px-6 py-3 text-sm font-medium uppercase tracking-wide text-primary-foreground transition-colors hover:bg-primary-hover disabled:opacity-60"
            style={{ letterSpacing: "0.08em" }}
          >
            {status === "submitting" ? "Sending…" : "Get my code"}
          </button>
        </form>
      )}

      {status === "error" && (
        <div className="mt-3">
          <ErrorBanner message="Couldn't save that — please try again." />
        </div>
      )}
    </div>
  );
}

export default JoinEmailCard;
