"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertCircle, CheckCircle, Mail } from "lucide-react";
import { TurnstileWidget } from "./turnstile-widget";

interface FieldErrors {
  email?: string[];
  firstName?: string[];
  lastName?: string[];
  phone?: string[];
}

/**
 * Magic-link sign-up form. Collects identity (firstName, lastName, email,
 * optional phone) and asks the server to provision a passwordless account
 * + email a magic link. No password collected, no password column written.
 *
 * The customer doesn't get "logged in" by submitting this form — they get
 * an email with a one-tap link. Tapping the link is what creates the
 * session.
 */
export function SignUpForm() {
  const [formData, setFormData] = useState({
    email: "",
    firstName: "",
    lastName: "",
    phone: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  // Turnstile CAPTCHA token. Empty until Cloudflare resolves the challenge.
  // The server-side verifier (src/lib/auth/turnstile.ts) fails closed in
  // prod when the secret is unset, so a stale or missing token here can't
  // sneak past in production.
  const [turnstileToken, setTurnstileToken] = useState<string>("");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name as keyof FieldErrors]) {
      setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFieldErrors({});
    setIsLoading(true);

    try {
      const sessionId = (window as any).posthog?.get_session_id?.() || undefined;

      // Carry the ?redirect= param through sign-up so a customer creating an
      // account mid-registration returns to /register/<season> after tapping
      // their magic link (validated server-side as a safe relative path).
      const redirectTo =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("redirect")
          : null;

      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sessionId ? { "X-PostHog-Session-Id": sessionId } : {}),
        },
        body: JSON.stringify({
          email: formData.email,
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone: formData.phone || undefined,
          turnstileToken: turnstileToken || undefined,
          redirectTo: redirectTo || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.details) {
          setFieldErrors(data.details);
        } else {
          setError(data.error || "Failed to create account");
        }
        return;
      }

      // Identify the new user client-side for session continuity. The
      // session itself is created when the customer taps the magic link;
      // identity here just tracks the signup event correctly.
      (window as any).posthog?.identify?.(data.user?.id, {
        email: data.user?.email,
        firstName: data.user?.firstName,
        lastName: data.user?.lastName,
      });

      setSent(true);
    } catch (err) {
      setError("An unexpected error occurred");
      (window as any).posthog?.captureException?.(err);
    } finally {
      setIsLoading(false);
    }
  };

  const inputClassName =
    "bg-cream-2 border-border text-ink placeholder:text-ink-faint focus:border-primary focus:ring-primary/50";

  if (sent) {
    return (
      <div className="space-y-5">
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm p-4 rounded-xl flex items-start gap-3">
          <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Account created — check your email</p>
            <p className="mt-1 text-green-600">
              We sent a one-tap sign-in link to{" "}
              <strong>{formData.email}</strong>. Tap it to finish setup. No
              password to remember.
            </p>
          </div>
        </div>
        <p className="text-ink-muted text-sm text-center">
          Didn't get an email?{" "}
          <a
            href="/signin"
            className="text-primary hover:text-primary/80 font-medium"
          >
            Send another link
          </a>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div
          role="alert"
          className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-4 rounded-xl flex items-center gap-2"
        >
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName" className="text-ink-muted">
            First Name
          </Label>
          <Input
            id="firstName"
            name="firstName"
            type="text"
            placeholder="John"
            value={formData.firstName}
            onChange={handleChange}
            required
            autoComplete="given-name"
            disabled={isLoading}
            aria-invalid={!!fieldErrors.firstName}
            aria-describedby={fieldErrors.firstName ? "firstName-error" : undefined}
            className={inputClassName}
          />
          {fieldErrors.firstName && (
            <p id="firstName-error" className="text-sm text-destructive">
              {fieldErrors.firstName[0]}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="lastName" className="text-ink-muted">
            Last Name
          </Label>
          <Input
            id="lastName"
            name="lastName"
            type="text"
            placeholder="Doe"
            value={formData.lastName}
            onChange={handleChange}
            required
            autoComplete="family-name"
            disabled={isLoading}
            aria-invalid={!!fieldErrors.lastName}
            aria-describedby={fieldErrors.lastName ? "lastName-error" : undefined}
            className={inputClassName}
          />
          {fieldErrors.lastName && (
            <p id="lastName-error" className="text-sm text-destructive">
              {fieldErrors.lastName[0]}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email" className="text-ink-muted">
          Email
        </Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="you@example.com"
          value={formData.email}
          onChange={handleChange}
          required
          autoComplete="email"
          disabled={isLoading}
          aria-invalid={!!fieldErrors.email}
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
          className={inputClassName}
        />
        {fieldErrors.email && (
          <p id="email-error" className="text-sm text-destructive">
            {fieldErrors.email[0]}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone" className="text-ink-muted">
          Phone <span className="text-ink-faint font-normal">(optional)</span>
        </Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          placeholder="(555) 123-4567"
          value={formData.phone}
          onChange={handleChange}
          autoComplete="tel"
          disabled={isLoading}
          className={inputClassName}
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
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Creating account…
          </>
        ) : (
          <>
            <Mail className="mr-2 h-4 w-4" />
            Create account & email sign-in link
          </>
        )}
      </Button>

      <p className="text-xs text-ink-faint text-center leading-relaxed">
        By creating an account, you agree to our{" "}
        <a
          href="/terms"
          className="text-primary hover:text-primary/80 underline underline-offset-2"
        >
          Terms of Service
        </a>{" "}
        and{" "}
        <a
          href="/privacy"
          className="text-primary hover:text-primary/80 underline underline-offset-2"
        >
          Privacy Policy
        </a>
        .
      </p>
    </form>
  );
}
