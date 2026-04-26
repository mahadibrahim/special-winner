"use client"

import { useState, useEffect } from "react"
import {
  Building2,
  CreditCard,
  MapPin,
  Palette,
  CheckCircle2,
  ArrowRight,
  Loader2,
  ExternalLink,
  AlertCircle,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"

interface OnboardingStep {
  id: string
  title: string
  description: string
  icon: typeof Building2
  status: "completed" | "current" | "pending"
  action?: {
    label: string
    href?: string
    onClick?: () => void
  }
}

interface OrganizationOnboardingProps {
  organizationId: string
  organizationName: string
}

export default function OrganizationOnboarding({
  organizationId,
  organizationName,
}: OrganizationOnboardingProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [stripeStatus, setStripeStatus] = useState<{
    hasStripeAccount: boolean
    chargesEnabled: boolean
    detailsSubmitted: boolean
    onboardingUrl: string | null
  } | null>(null)
  const [locationCount, setLocationCount] = useState(0)
  const [settingsComplete, setSettingsComplete] = useState(false)
  const [isConnectingStripe, setIsConnectingStripe] = useState(false)

  useEffect(() => {
    fetchOnboardingStatus()
  }, [organizationId])

  const fetchOnboardingStatus = async () => {
    try {
      setIsLoading(true)

      // Fetch Stripe status
      const stripeResponse = await fetch(
        `/api/admin/stripe-connect/status?organizationId=${organizationId}`
      )
      if (stripeResponse.ok) {
        const data = await stripeResponse.json()
        setStripeStatus({
          hasStripeAccount: data.hasStripeAccount,
          chargesEnabled: data.status?.chargesEnabled ?? false,
          detailsSubmitted: data.status?.detailsSubmitted ?? false,
          onboardingUrl: data.onboardingUrl,
        })
      }

      // Fetch organization details
      const orgResponse = await fetch(`/api/admin/organizations/${organizationId}`)
      if (orgResponse.ok) {
        const data = await orgResponse.json()
        setLocationCount(data.organization?.locationCount ?? 0)
        setSettingsComplete(
          !!data.organization?.settings?.branding?.primaryColor &&
          !!data.organization?.email
        )
      }
    } catch (error) {
      console.error("Error fetching onboarding status:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleConnectStripe = async () => {
    try {
      setIsConnectingStripe(true)

      const response = await fetch("/api/admin/stripe-connect/create-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizationId }),
      })

      if (!response.ok) {
        throw new Error("Failed to create Stripe account")
      }

      const data = await response.json()

      if (data.onboardingUrl) {
        window.location.href = data.onboardingUrl
      }
    } catch (error) {
      console.error("Error connecting Stripe:", error)
    } finally {
      setIsConnectingStripe(false)
    }
  }

  const handleContinueStripeOnboarding = () => {
    if (stripeStatus?.onboardingUrl) {
      window.location.href = stripeStatus.onboardingUrl
    }
  }

  // Determine step statuses
  const getSteps = (): OnboardingStep[] => {
    const basicInfoComplete = true // Always complete if we're here
    const paymentsComplete = stripeStatus?.chargesEnabled ?? false
    const locationsComplete = locationCount > 0
    const brandingComplete = settingsComplete

    return [
      {
        id: "basic-info",
        title: "Basic Information",
        description: "Organization name, contact details, and address",
        icon: Building2,
        status: basicInfoComplete ? "completed" : "current",
        action: basicInfoComplete ? undefined : {
          label: "Complete Setup",
          href: `/admin/organizations/${organizationId}/edit`,
        },
      },
      {
        id: "payments",
        title: "Payment Setup",
        description: "Connect Stripe to accept payments",
        icon: CreditCard,
        status: paymentsComplete
          ? "completed"
          : basicInfoComplete
          ? "current"
          : "pending",
        action: paymentsComplete
          ? {
              label: "View Dashboard",
              href: `/admin/organizations/${organizationId}/stripe`,
            }
          : stripeStatus?.hasStripeAccount && !stripeStatus?.detailsSubmitted
          ? {
              label: "Continue Onboarding",
              onClick: handleContinueStripeOnboarding,
            }
          : {
              label: "Connect Stripe",
              onClick: handleConnectStripe,
            },
      },
      {
        id: "locations",
        title: "Add Locations",
        description: "Set up at least one physical location",
        icon: MapPin,
        status: locationsComplete
          ? "completed"
          : paymentsComplete || (stripeStatus?.hasStripeAccount ?? false)
          ? "current"
          : "pending",
        action: {
          label: locationsComplete ? "Manage Locations" : "Add Location",
          href: `/admin/organizations/${organizationId}/locations`,
        },
      },
      {
        id: "branding",
        title: "Customize Branding",
        description: "Set up colors, logo, and other branding",
        icon: Palette,
        status: brandingComplete
          ? "completed"
          : locationsComplete
          ? "current"
          : "pending",
        action: {
          label: brandingComplete ? "Edit Branding" : "Set Up Branding",
          href: `/admin/organizations/${organizationId}/settings`,
        },
      },
    ]
  }

  const steps = getSteps()
  const completedSteps = steps.filter((s) => s.status === "completed").length
  const progress = (completedSteps / steps.length) * 100

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  const isComplete = progress === 100

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">
            {isComplete ? "Setup Complete!" : "Complete Your Setup"}
          </h2>
          <p className="text-gray-400 mt-1">
            {isComplete
              ? `${organizationName} is ready to accept registrations`
              : `Get ${organizationName} ready to accept registrations`}
          </p>
        </div>
        {isComplete && (
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/20 border border-green-500/30">
            <CheckCircle2 className="w-5 h-5 text-green-500" />
            <span className="text-green-500 font-medium">All Set!</span>
          </div>
        )}
      </div>

      {/* Progress Bar */}
      <Card className="bg-white/[0.02] border-white/[0.06]">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-400">Setup Progress</span>
            <span className="text-sm font-medium text-white">
              {completedSteps} of {steps.length} completed
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </CardContent>
      </Card>

      {/* Steps */}
      <div className="space-y-4">
        {steps.map((step, index) => (
          <Card
            key={step.id}
            className={`bg-white/[0.02] border-white/[0.06] transition-all ${
              step.status === "current"
                ? "ring-1 ring-primary/50"
                : step.status === "completed"
                ? "opacity-75"
                : "opacity-50"
            }`}
          >
            <CardContent className="py-5">
              <div className="flex items-center gap-4">
                {/* Step number/status */}
                <div
                  className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                    step.status === "completed"
                      ? "bg-green-500/20"
                      : step.status === "current"
                      ? "bg-primary/20"
                      : "bg-white/5"
                  }`}
                >
                  {step.status === "completed" ? (
                    <CheckCircle2 className="w-6 h-6 text-green-500" />
                  ) : (
                    <step.icon
                      className={`w-6 h-6 ${
                        step.status === "current" ? "text-primary" : "text-gray-500"
                      }`}
                    />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1">
                  <h3 className="font-semibold text-white">{step.title}</h3>
                  <p className="text-sm text-gray-400">{step.description}</p>
                </div>

                {/* Action */}
                {step.action && (
                  <Button
                    variant={step.status === "current" ? "default" : "outline"}
                    className={
                      step.status === "current"
                        ? ""
                        : "border-white/10 text-gray-400 hover:text-white hover:bg-white/5"
                    }
                    disabled={step.status === "pending" || isConnectingStripe}
                    onClick={step.action.onClick}
                    asChild={!!step.action.href}
                  >
                    {step.action.href ? (
                      <a href={step.action.href} className="flex items-center gap-2">
                        {step.action.label}
                        <ArrowRight className="w-4 h-4" />
                      </a>
                    ) : (
                      <span className="flex items-center gap-2">
                        {isConnectingStripe && step.id === "payments" ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : null}
                        {step.action.label}
                        {!isConnectingStripe && <ArrowRight className="w-4 h-4" />}
                      </span>
                    )}
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Help Section */}
      {!isComplete && (
        <Card className="bg-white/[0.02] border-white/[0.06]">
          <CardContent className="py-5">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h4 className="font-medium text-white">Need Help?</h4>
                <p className="text-sm text-gray-400 mt-1">
                  Contact support if you need assistance setting up your organization.
                </p>
                <a
                  href="mailto:hello@aspiresportsohio.com"
                  className="text-sm text-primary hover:underline mt-2 inline-flex items-center gap-1"
                >
                  hello@aspiresportsohio.com
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
