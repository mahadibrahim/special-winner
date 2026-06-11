"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertCircle, CheckCircle, Mail } from "lucide-react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { TurnstileWidget } from "./turnstile-widget";

/**
 * Magic-link sign-in form. No password field — the customer enters their
 * email, we send a one-tap sign-in link via `/api/auth/forgot-password`
 * (which despite the legacy name is the canonical magic-link issuer).
 *
 * The password-based `/api/auth/signin` endpoint is preserved server-side
 * for E2E tests and any existing scripts; it's just no longer surfaced
 * in the UI.
 */
export function SignInForm() {
  useHydrationBeacon();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  // Turnstile CAPTCHA token. The /api/auth/forgot-password endpoint this
  // form posts to (the canonical magic-link issuer) verifies it
  // server-side and fails closed in prod, so the widget must be rendered
  // here just as it is on the signup form.
  const [turnstileToken, setTurnstileToken] = useState<string>("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      // Carry the ?redirect= param (set by middleware bounces and the
      // registration flow's "Sign in" link) through to the magic-link issuer
      // so redemption returns the user to where they started.
      const redirectTo =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("redirect")
          : null;
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          turnstileToken: turnstileToken || undefined,
          redirectTo: redirectTo || undefined,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Failed to send sign-in link");
        return;
      }
      setSent(true);
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-5">
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm p-4 rounded-xl flex items-start gap-3">
          <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Check your email</p>
            <p className="mt-1 text-green-600">
              If an account exists with <strong>{email}</strong>, you'll get
              a sign-in link in the next minute. Tap it to sign in — no
              password needed.
            </p>
          </div>
        </div>
        <p className="text-ink-muted text-sm text-center">
          Didn't get an email?{" "}
          <button
            type="button"
            onClick={() => {
              setSent(false);
              setEmail("");
            }}
            className="text-primary hover:text-primary/80 font-medium"
          >
            Try again
          </button>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div
          id="signin-error"
          role="alert"
          className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-4 rounded-xl flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="email" className="text-ink-muted">
          Email
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          disabled={isLoading}
          aria-invalid={!!error}
          aria-describedby={error ? "signin-error" : undefined}
          className="bg-cream-2 border-border text-ink placeholder:text-ink-faint focus:border-primary focus:ring-primary/50"
        />
      </div>

      <div className="flex justify-center">
        <TurnstileWidget
          onToken={(t) => setTurnstileToken(t)}
          onError={() => setTurnstileToken("")}
        />
      </div>

      <Button
        type="submit"
        className="w-full bg-primary hover:bg-primary/90 py-6 text-base font-semibold"
        disabled={isLoading || !email.trim()}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sending…
          </>
        ) : (
          <>
            <Mail className="mr-2 h-4 w-4" />
            Email me a sign-in link
          </>
        )}
      </Button>

      <p className="text-center text-xs text-ink-faint">
        We'll email you a one-tap link to sign in. No password to remember.
      </p>
    </form>
  );
}
