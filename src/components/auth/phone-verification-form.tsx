"use client"

import { useState } from "react"
import { Phone, Check, Loader2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

/**
 * PhoneVerificationForm — reusable two-step OTP flow.
 *
 * Step 1: parent enters phone, clicks "Send code"
 * Step 2: parent enters the 6-digit code, clicks "Verify"
 * On success, the onVerified callback fires with the normalized phone.
 *
 * The form handles API errors, attempts remaining, expired codes, and
 * resend. Designed to be embeddable in:
 *  - Dashboard settings (standalone)
 *  - Registration wizard (inline step)
 *  - Signup flow (optional channel binding)
 */

export interface PhoneVerificationFormProps {
  organizationId: string
  purpose?: "registration" | "phone_change" | "recovery"
  defaultPhone?: string
  onVerified: (phone: string) => void | Promise<void>
  autoFocus?: boolean
}

export function PhoneVerificationForm({
  organizationId,
  purpose = "registration",
  defaultPhone = "",
  onVerified,
  autoFocus = false,
}: PhoneVerificationFormProps) {
  const [step, setStep] = useState<"phone" | "code" | "done">("phone")
  const [phone, setPhone] = useState(defaultPhone)
  const [code, setCode] = useState("")
  const [verificationId, setVerificationId] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null)

  async function handleSendCode() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/auth/phone-verify/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, organizationId, purpose }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Could not send code")
      }
      setVerificationId(data.verificationId)
      setExpiresAt(new Date(data.expiresAt))
      setStep("code")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong")
    } finally {
      setLoading(false)
    }
  }

  async function handleVerifyCode() {
    if (!verificationId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/auth/phone-verify/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verificationId, code }),
      })
      const data = await res.json()
      if (!res.ok) {
        setAttemptsRemaining(
          typeof data.attemptsRemaining === "number"
            ? data.attemptsRemaining
            : null,
        )
        throw new Error(data.error || "Incorrect code")
      }
      setStep("done")
      await onVerified(data.phone)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Incorrect code")
    } finally {
      setLoading(false)
    }
  }

  if (step === "done") {
    return (
      <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
          <Check className="w-4 h-4 text-emerald-400" />
        </div>
        <div>
          <p className="text-sm font-medium text-white">Phone verified</p>
          <p className="text-xs text-gray-500">{phone}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {step === "phone" && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Phone number
            </label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                type="tel"
                placeholder="(614) 555-1234"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="pl-10"
                autoFocus={autoFocus}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && phone.trim()) {
                    handleSendCode()
                  }
                }}
              />
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
              We'll text you a 6-digit code. Standard message rates apply.
            </p>
          </div>
          <Button
            onClick={handleSendCode}
            disabled={loading || !phone.trim()}
            className="w-full"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              "Send verification code"
            )}
          </Button>
        </>
      )}

      {step === "code" && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Enter the 6-digit code
            </label>
            <Input
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              autoFocus
              className="text-center text-2xl tracking-widest"
              onKeyDown={(e) => {
                if (e.key === "Enter" && code.length === 6) {
                  handleVerifyCode()
                }
              }}
            />
            <p className="mt-1.5 text-xs text-gray-500">
              Sent to {phone}.{" "}
              {expiresAt && (
                <span>
                  Expires at{" "}
                  {expiresAt.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  .
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setStep("phone")
                setCode("")
                setError(null)
              }}
              disabled={loading}
            >
              Back
            </Button>
            <Button
              onClick={handleVerifyCode}
              disabled={loading || code.length !== 6}
              className="flex-1"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Verify"
              )}
            </Button>
          </div>
          <button
            type="button"
            onClick={handleSendCode}
            disabled={loading}
            className="w-full text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            Didn't get it? Send a new code
          </button>
        </>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-2 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div>
            <p>{error}</p>
            {attemptsRemaining !== null && attemptsRemaining > 0 && (
              <p className="text-red-400 mt-1">
                {attemptsRemaining} attempt{attemptsRemaining === 1 ? "" : "s"} remaining
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
