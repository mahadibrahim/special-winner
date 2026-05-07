"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface BookButtonProps {
  sessionId: string;
  /**
   * Per-user resolved amount in cents from the detail endpoint. Null if
   * unauthenticated; the click handler bounces to /signin in that case.
   */
  resolvedAmountCents: number | null;
  /** True when capacity gate is closed; the click joins the waitlist. */
  isFull: boolean;
  /** Existing booking status, if any. */
  alreadyBookedStatus: string | null;
  isAuthenticated: boolean;
}

export function BookButton({
  sessionId,
  resolvedAmountCents,
  isFull,
  alreadyBookedStatus,
  isAuthenticated,
}: BookButtonProps) {
  const [busy, setBusy] = useState(false);

  if (!isAuthenticated) {
    return (
      <Button asChild size="lg" className="w-full">
        <a href={`/signin?redirect=/dropin/${sessionId}`}>Sign in to book</a>
      </Button>
    );
  }

  if (alreadyBookedStatus === "confirmed") {
    return (
      <Button asChild size="lg" variant="outline" className="w-full">
        <a href="/dashboard/bookings">View in dashboard</a>
      </Button>
    );
  }
  if (alreadyBookedStatus === "waitlisted") {
    return (
      <Button size="lg" disabled className="w-full">
        On waitlist
      </Button>
    );
  }
  if (alreadyBookedStatus === "pending_claim") {
    return (
      <Button asChild size="lg" className="w-full">
        <a href="/dashboard/bookings">Confirm spot</a>
      </Button>
    );
  }

  const submit = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/dropin/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(
          typeof json.error === "string"
            ? json.error
            : json.error?.message || "Booking failed",
        );
        return;
      }
      if (json.paymentRequired && json.checkoutUrl) {
        window.location.href = json.checkoutUrl;
        return;
      }
      toast.success(
        json.teamAssignment
          ? `Booked — Team ${json.teamAssignment}`
          : "Booked",
      );
      window.location.href = "/dashboard/bookings?booking=success";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  };

  const label = isFull
    ? "Join waitlist"
    : resolvedAmountCents === 0
      ? "Book — free"
      : resolvedAmountCents == null
        ? "Book"
        : `Book — $${(resolvedAmountCents / 100).toFixed(2)}`;

  return (
    <Button onClick={submit} disabled={busy} size="lg" className="w-full">
      {busy ? "Working…" : label}
    </Button>
  );
}
