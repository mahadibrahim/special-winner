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

  // Guest-mode contact fields — drop-ins are impulse purchases, so
  // anonymous visitors book with name + email instead of bouncing to
  // /signin (see /api/dropin/guest-checkout). Waitlist still requires an
  // account: joining one is a commitment to come back later.
  const [guestFirstName, setGuestFirstName] = useState("");
  const [guestLastName, setGuestLastName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");

  if (!isAuthenticated && isFull) {
    return (
      <Button asChild size="lg" className="w-full">
        <a href={`/signin?redirect=/dropin/${sessionId}`}>
          Sign in to join waitlist
        </a>
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
      const endpoint = isAuthenticated
        ? "/api/dropin/bookings"
        : "/api/dropin/guest-checkout";
      const payload = isAuthenticated
        ? {
            sessionId,
            waiverAccepted: true,
            waiverName: waiverName.trim(),
          }
        : {
            sessionId,
            firstName: guestFirstName.trim(),
            lastName: guestLastName.trim(),
            email: guestEmail.trim(),
            waiverAccepted: true,
            waiverName: waiverName.trim(),
          };
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      if (isAuthenticated || json.wasNewUser) {
        // New guest users get a session cookie from the endpoint, so the
        // dashboard works for them too.
        window.location.href = "/dashboard/bookings?booking=success";
      } else {
        // Existing account booked as guest — no session cookie was set
        // (account-takeover prevention). Point them at sign-in.
        window.location.href = `/dropin/${sessionId}?booking=success`;
      }
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

  const guestFieldsValid =
    isAuthenticated ||
    (guestFirstName.trim().length > 0 &&
      guestLastName.trim().length > 0 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim()));

  const canConfirm =
    waiverAccepted && waiverName.trim().length > 0 && guestFieldsValid;

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

          {!isAuthenticated && (
            <div className="space-y-3 pb-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="guest-first-name" className="text-sm">
                    First name
                  </Label>
                  <Input
                    id="guest-first-name"
                    value={guestFirstName}
                    onChange={(e) => setGuestFirstName(e.target.value)}
                    autoComplete="given-name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="guest-last-name" className="text-sm">
                    Last name
                  </Label>
                  <Input
                    id="guest-last-name"
                    value={guestLastName}
                    onChange={(e) => setGuestLastName(e.target.value)}
                    autoComplete="family-name"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="guest-email" className="text-sm">
                  Email
                </Label>
                <Input
                  id="guest-email"
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="you@email.com"
                />
              </div>
              <p className="text-xs text-ink-faint">
                Already have an account?{" "}
                <a
                  href={`/signin?redirect=/dropin/${sessionId}`}
                  className="underline hover:text-ink-2"
                >
                  Sign in
                </a>{" "}
                to use your saved details and member pricing.
              </p>
            </div>
          )}

          <p className="text-sm text-ink-2 leading-relaxed">{WAIVER_TEXT}</p>

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
