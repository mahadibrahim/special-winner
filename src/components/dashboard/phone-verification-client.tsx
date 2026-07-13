"use client"

import { PhoneVerificationForm } from "@/components/auth/phone-verification-form"

/**
 * Wraps PhoneVerificationForm with a callback that persists the verified
 * phone to the user's profile after the OTP succeeds. Used on the
 * /dashboard/settings/verify-phone page.
 *
 * After verification, the user's phone_verified flag is flipped by the
 * backend POST /api/dashboard/settings/phone endpoint.
 */
export function PhoneVerificationClient({
  organizationId,
  initialPhone,
}: {
  organizationId: string
  initialPhone: string
}) {
  async function handleVerified(phone: string, smsConsent: boolean) {
    try {
      await fetch("/api/dashboard/settings/phone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, verified: true, smsConsent }),
      })
    } catch (err) {
      console.error("Failed to persist verified phone:", err)
    }

    // Redirect back to the main settings page after a brief success flash
    setTimeout(() => {
      window.location.href = "/dashboard/settings"
    }, 1500)
  }

  return (
    <PhoneVerificationForm
      organizationId={organizationId}
      purpose="registration"
      defaultPhone={initialPhone}
      autoFocus
      onVerified={handleVerified}
    />
  )
}
