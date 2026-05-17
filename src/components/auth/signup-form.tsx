"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertCircle } from "lucide-react";
import { TurnstileWidget } from "./turnstile-widget";

interface FieldErrors {
  email?: string[];
  password?: string[];
  firstName?: string[];
  lastName?: string[];
}

export function SignUpForm() {
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    firstName: "",
    lastName: "",
    phone: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isLoading, setIsLoading] = useState(false);
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

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (formData.password.length < 8) {
      setFieldErrors({ password: ["Password must be at least 8 characters"] });
      return;
    }

    setIsLoading(true);

    try {
      const sessionId = (window as any).posthog?.get_session_id?.() || undefined;

      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sessionId ? { "X-PostHog-Session-Id": sessionId } : {}),
        },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          firstName: formData.firstName,
          lastName: formData.lastName,
          phone: formData.phone || undefined,
          turnstileToken: turnstileToken || undefined,
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

      // Identify the new user client-side for session continuity
      (window as any).posthog?.identify?.(data.user?.id, {
        email: data.user?.email,
        firstName: data.user?.firstName,
        lastName: data.user?.lastName,
      });

      // Check for explicit redirect URL in query params
      const urlParams = new URLSearchParams(window.location.search);
      const explicitRedirect = urlParams.get("redirect") || urlParams.get("returnUrl");

      if (explicitRedirect) {
        window.location.href = explicitRedirect;
      } else {
        // New users are parents by default, redirect to dashboard
        window.location.href = "/dashboard";
      }
    } catch (err) {
      setError("An unexpected error occurred");
      (window as any).posthog?.captureException?.(err);
    } finally {
      setIsLoading(false);
    }
  };

  const inputClassName = "bg-cream-2 border-border text-ink placeholder:text-ink-faint focus:border-primary focus:ring-primary/50";

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
          <Label htmlFor="firstName" className="text-ink-muted">First Name</Label>
          <Input
            id="firstName"
            name="firstName"
            type="text"
            placeholder="John"
            value={formData.firstName}
            onChange={handleChange}
            required
            disabled={isLoading}
            aria-invalid={!!fieldErrors.firstName}
            aria-describedby={fieldErrors.firstName ? "firstName-error" : undefined}
            className={inputClassName}
          />
          {fieldErrors.firstName && (
            <p id="firstName-error" className="text-sm text-destructive">{fieldErrors.firstName[0]}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="lastName" className="text-ink-muted">Last Name</Label>
          <Input
            id="lastName"
            name="lastName"
            type="text"
            placeholder="Doe"
            value={formData.lastName}
            onChange={handleChange}
            required
            disabled={isLoading}
            aria-invalid={!!fieldErrors.lastName}
            aria-describedby={fieldErrors.lastName ? "lastName-error" : undefined}
            className={inputClassName}
          />
          {fieldErrors.lastName && (
            <p id="lastName-error" className="text-sm text-destructive">{fieldErrors.lastName[0]}</p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="email" className="text-ink-muted">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          placeholder="you@example.com"
          value={formData.email}
          onChange={handleChange}
          required
          disabled={isLoading}
          aria-invalid={!!fieldErrors.email}
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
          className={inputClassName}
        />
        {fieldErrors.email && (
          <p id="email-error" className="text-sm text-destructive">{fieldErrors.email[0]}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone" className="text-ink-muted">Phone (optional)</Label>
        <Input
          id="phone"
          name="phone"
          type="tel"
          placeholder="(555) 123-4567"
          value={formData.phone}
          onChange={handleChange}
          disabled={isLoading}
          className={inputClassName}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password" className="text-ink-muted">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          placeholder="At least 8 characters"
          value={formData.password}
          onChange={handleChange}
          required
          disabled={isLoading}
          aria-invalid={!!fieldErrors.password}
          aria-describedby={fieldErrors.password ? "password-error" : undefined}
          className={inputClassName}
        />
        {fieldErrors.password && (
          <p id="password-error" className="text-sm text-destructive">{fieldErrors.password[0]}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword" className="text-ink-muted">Confirm Password</Label>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          placeholder="Confirm your password"
          value={formData.confirmPassword}
          onChange={handleChange}
          required
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
            Creating account...
          </>
        ) : (
          "Create Account"
        )}
      </Button>

      <p className="text-xs text-ink-faint text-center leading-relaxed">
        By creating an account, you agree to our{" "}
        <a href="/terms" className="text-primary hover:text-primary/80 underline underline-offset-2">
          Terms of Service
        </a>{" "}
        and{" "}
        <a href="/privacy" className="text-primary hover:text-primary/80 underline underline-offset-2">
          Privacy Policy
        </a>
        .
      </p>
    </form>
  );
}
