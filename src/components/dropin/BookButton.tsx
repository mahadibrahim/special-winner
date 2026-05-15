"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const WAIVER_TEXT =
  "I understand that participating in drop-in sports sessions involves physical activity and inherent risk of injury. I voluntarily assume all risks associated with participation and release Aspire Sports, its partners, and staff from liability for any injury, loss, or damage arising from my participation. I confirm that I am physically fit to participate and have no medical conditions that would prevent safe participation.";

export function BookButton({
  sessionId,
  resolvedAmountCents,
  isFull,
  alreadyBookedStatus,
  isAuthenticated,
}: BookButtonProps) {
  const [busy, setBusy] = useState(false);
  const [showWaiver, setShowWaiver] = useState(false);
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [waiverName, setWaiverName] = useState("");

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

  const submitBooking = async () => {
    setBusy(true);
    setShowWaiver(false);
    try {
      const res = await fetch("/api/dropin/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          waiverAccepted: true,
          waiverName: waiverName.trim(),
        }),
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

  const openWaiver = () => {
    setWaiverAccepted(false);
    setWaiverName("");
    setShowWaiver(true);
  };

  const canConfirm = waiverAccepted && waiverName.trim().length > 0;

  const label = isFull
    ? "Join waitlist"
    : resolvedAmountCents === 0
      ? "Book — free"
      : resolvedAmountCents == null
        ? "Book"
        : `Book — $${(resolvedAmountCents / 100).toFixed(2)}`;

  return (
    <>
      <Button onClick={openWaiver} disabled={busy} size="lg" className="w-full">
        {busy ? "Working…" : label}
      </Button>

      <Dialog open={showWaiver} onOpenChange={setShowWaiver}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Waiver &amp; Assumption of Risk</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-stone-700 leading-relaxed">{WAIVER_TEXT}</p>

          <div className="space-y-4 pt-2">
            <div className="flex items-start gap-3">
              <Checkbox
                id="waiver-accept"
                checked={waiverAccepted}
                onCheckedChange={(checked) =>
                  setWaiverAccepted(checked === true)
                }
              />
              <Label
                htmlFor="waiver-accept"
                className="text-sm leading-snug cursor-pointer"
              >
                I accept the waiver above
              </Label>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="waiver-name" className="text-sm">
                Full name (typed signature)
              </Label>
              <Input
                id="waiver-name"
                value={waiverName}
                onChange={(e) => setWaiverName(e.target.value)}
                placeholder="Your full name"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowWaiver(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              onClick={submitBooking}
              disabled={!canConfirm || busy}
            >
              {busy ? "Working…" : "Confirm & book"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
