"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBanner } from "@/components/ui/error-banner";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";

interface RentalClaimFormProps {
  token: string;
  renterEmail: string;
  renterName: string;
  contactPhone: string;
}

/** Friendly copy for the error codes the claim endpoint can return. */
function friendlyError(status: number, code: string | undefined, contactPhone: string): string {
  switch (code) {
    case "already_claimed":
      return "This booking has already been claimed by another account.";
    case "not_found":
    case "rental_not_found":
      return `This link isn't valid. Call or text us at ${contactPhone} and we'll help.`;
    case "no_email_on_rental":
      return `We don't have an email on file for this booking. Call or text us at ${contactPhone}.`;
    default:
      break;
  }
  if (status === 401) return "That email and password don't match. Try again.";
  if (status === 429) return "Too many attempts — wait a minute and try again.";
  return "Something went wrong. Please try again.";
}

export default function RentalClaimForm({
  token,
  renterEmail,
  renterName,
  contactPhone,
}: RentalClaimFormProps) {
  useHydrationBeacon();

  const [mode, setMode] = useState<"signup" | "signin">("signup");
  const [name, setName] = useState(renterName);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/rentals/claim/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "signup" ? { mode, password, name } : { mode, password },
        ),
      });
      const body = await res.json().catch(() => ({}));

      if (res.ok && body.ok) {
        window.location.href = body.redirect ?? "/dashboard/bookings";
        return;
      }

      if (res.status === 409 && body.error === "account_exists") {
        setMode("signin");
        setNotice("An account with this email already exists — sign in below to claim your booking.");
        setPassword("");
        return;
      }

      setError(friendlyError(res.status, body.error, contactPhone));
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-paper p-6">
      <div>
        <h2 className="text-lg font-semibold text-ink">
          {mode === "signup" ? "Create your account" : "Sign in"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signup"
            ? "Set a password to pay for and manage your booking."
            : "Sign in with your existing account to claim this booking."}
        </p>
      </div>

      {notice && (
        <div className="rounded-md border border-border bg-cream px-3 py-2 text-sm text-ink">
          {notice}
        </div>
      )}
      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className="space-y-1.5">
        <Label htmlFor="claim-email">Email</Label>
        <Input id="claim-email" type="email" value={renterEmail} readOnly disabled />
      </div>

      {mode === "signup" && (
        <div className="space-y-1.5">
          <Label htmlFor="claim-name">Name</Label>
          <Input
            id="claim-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={1}
            maxLength={200}
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="claim-password">Password</Label>
        <Input
          id="claim-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={8}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
        />
        {mode === "signup" && (
          <p className="text-xs text-muted-foreground">At least 8 characters.</p>
        )}
      </div>

      <Button type="submit" disabled={busy} className="w-full">
        {busy ? "Please wait…" : mode === "signup" ? "Create account & continue" : "Sign in & continue"}
      </Button>

      <button
        type="button"
        onClick={() => {
          setMode(mode === "signup" ? "signin" : "signup");
          setError(null);
          setNotice(null);
          setPassword("");
        }}
        className="w-full text-center text-sm text-muted-foreground underline underline-offset-2"
      >
        {mode === "signup" ? "Already have an account? Sign in" : "Need to create an account instead?"}
      </button>
    </form>
  );
}
