"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertCircle } from "lucide-react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";

export function SignInForm() {
  useHydrationBeacon();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const sessionId = (window as any).posthog?.get_session_id?.() || undefined;

      const response = await fetch("/api/auth/signin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(sessionId ? { "X-PostHog-Session-Id": sessionId } : {}),
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to sign in");
        (window as any).posthog?.capture?.("sign_in_failed", { reason: data.error });
        return;
      }

      // Identify the user client-side for session continuity
      (window as any).posthog?.identify?.(data.user?.id, {
        email: data.user?.email,
        firstName: data.user?.firstName,
        lastName: data.user?.lastName,
      });

      // Check for explicit redirect URL in query params
      const urlParams = new URLSearchParams(window.location.search);
      const explicitRedirect = urlParams.get("redirect") || urlParams.get("returnUrl");

      if (explicitRedirect) {
        // If there's an explicit redirect, use it
        window.location.href = explicitRedirect;
      } else {
        // Otherwise, redirect based on user's primary role
        const roles: string[] = data.roles || [];

        if (roles.includes("super_admin") || roles.includes("location_admin")) {
          window.location.href = "/admin";
        } else if (roles.includes("coach")) {
          window.location.href = "/coach";
        } else {
          window.location.href = "/dashboard";
        }
      }
    } catch (err) {
      setError("An unexpected error occurred");
      (window as any).posthog?.captureException?.(err);
    } finally {
      setIsLoading(false);
    }
  };

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
        <Label htmlFor="email" className="text-ink-muted">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          disabled={isLoading}
          aria-invalid={!!error}
          aria-describedby={error ? "signin-error" : undefined}
          className="bg-cream-2 border-border text-ink placeholder:text-ink-faint focus:border-primary focus:ring-primary/50"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password" className="text-ink-muted">Password</Label>
          <a href="/email-link-signin" className="text-xs text-primary hover:text-primary/80">
            Email me a sign-in link
          </a>
        </div>
        <Input
          id="password"
          type="password"
          placeholder="Enter your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          disabled={isLoading}
          aria-invalid={!!error}
          aria-describedby={error ? "signin-error" : undefined}
          className="bg-cream-2 border-border text-ink placeholder:text-ink-faint focus:border-primary focus:ring-primary/50"
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
            Signing in...
          </>
        ) : (
          "Sign In"
        )}
      </Button>
    </form>
  );
}
