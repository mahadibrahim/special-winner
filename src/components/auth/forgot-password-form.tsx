"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { TurnstileWidget } from "./turnstile-widget";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // Turnstile CAPTCHA token. Empty until Cloudflare resolves the challenge.
  const [turnstileToken, setTurnstileToken] = useState<string>("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    setIsLoading(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, turnstileToken: turnstileToken || undefined }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Failed to send reset email");
        return;
      }

      setSuccess(true);
    } catch {
      setError("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="space-y-5">
        <div className="bg-green-50 border border-green-200 text-green-700 text-sm p-4 rounded-xl flex items-start gap-3">
          <CheckCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium">Check your email</p>
            <p className="mt-1 text-green-600">
              If an account exists with the email <strong>{email}</strong>, you will receive a password reset link shortly.
            </p>
          </div>
        </div>
        <p className="text-ink-muted text-sm text-center">
          Didn't receive an email?{" "}
          <button
            onClick={() => {
              setSuccess(false);
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
        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-4 rounded-xl flex items-center gap-2">
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
          className="bg-cream-2 border-border text-ink placeholder:text-ink-faint focus:border-primary focus:ring-primary/50"
        />
      </div>

      <TurnstileWidget
        onToken={(t) => setTurnstileToken(t)}
        onError={() => setTurnstileToken("")}
      />

      <Button
        type="submit"
        className="w-full bg-primary hover:bg-primary/90 py-6 text-base font-semibold"
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Sending reset link...
          </>
        ) : (
          "Send Reset Link"
        )}
      </Button>
    </form>
  );
}
