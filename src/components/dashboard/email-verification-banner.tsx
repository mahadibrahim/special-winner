"use client"

import { useState } from "react"
import { AlertTriangle, Mail, X, Loader2, CheckCircle } from "lucide-react"
import { Button } from "@/components/ui/button"

interface EmailVerificationBannerProps {
  email: string
  emailVerified: boolean
}

export function EmailVerificationBanner({ email, emailVerified }: EmailVerificationBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [resendStatus, setResendStatus] = useState<"idle" | "success" | "error">("idle")

  // Don't show if email is verified or banner is dismissed
  if (emailVerified || isDismissed) {
    return null
  }

  async function handleResendVerification() {
    setIsResending(true)
    setResendStatus("idle")

    try {
      const response = await fetch("/api/auth/send-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })

      if (!response.ok) {
        throw new Error("Failed to send verification email")
      }

      setResendStatus("success")
    } catch (err) {
      console.error(err)
      setResendStatus("error")
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div className="rounded-2xl bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 border border-amber-500/20 p-4">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <div className="w-8 h-8 rounded-full bg-amber-500/20 flex items-center justify-center">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-amber-200">Verify your email address</h3>
          <p className="text-sm text-amber-200/70 mt-1">
            We sent a verification link to <span className="font-medium text-amber-100">{email}</span>.
            Please check your inbox and verify your email to access all features.
          </p>

          <div className="flex items-center gap-3 mt-3">
            {resendStatus === "success" ? (
              <div className="flex items-center gap-2 text-sm text-emerald-400">
                <CheckCircle className="w-4 h-4" />
                <span>Verification email sent!</span>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={handleResendVerification}
                disabled={isResending}
                className="border-amber-500/30 text-amber-200 hover:bg-amber-500/10 hover:text-amber-100"
              >
                {isResending ? (
                  <>
                    <Loader2 className="w-3 h-3 mr-2 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="w-3 h-3 mr-2" />
                    Resend verification email
                  </>
                )}
              </Button>
            )}

            {resendStatus === "error" && (
              <span className="text-sm text-red-400">Failed to send. Try again.</span>
            )}
          </div>
        </div>

        <button
          onClick={() => setIsDismissed(true)}
          className="flex-shrink-0 p-1 rounded-lg hover:bg-white/5 text-amber-200/50 hover:text-amber-200 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
