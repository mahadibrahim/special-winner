"use client"

import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import type { Organization, OrganizationSettings, OrganizationFeatures, Location } from "@/lib/db/schema/organizations"

// ============================================
// TYPES
// ============================================

export interface OrganizationContextValue {
  // Current organization
  organization: Organization | null
  isLoading: boolean
  error: string | null

  // Current location (if location-specific)
  location: Location | null

  // Computed values
  settings: OrganizationSettings | null
  features: OrganizationFeatures | null
  branding: OrganizationSettings["branding"] | null

  // Helper functions
  isFeatureEnabled: (feature: keyof OrganizationFeatures) => boolean
  getBrandingValue: <K extends keyof OrganizationSettings["branding"]>(
    key: K
  ) => OrganizationSettings["branding"][K] | undefined
}

// Default settings for fallback
export const DEFAULT_SETTINGS: OrganizationSettings = {
  branding: {
    primaryColor: "#cc442c",
    secondaryColor: "#1a1a24",
    accentColor: "#f59e0b",
    backgroundColor: "#0a0a0f",
    textColor: "#ffffff",
    fontFamily: "system-ui, sans-serif",
    borderRadius: "0.75rem",
  },
  contact: {
    supportEmail: "support@aspiresports.com",
  },
  payments: {
    currency: "USD",
  },
  registration: {
    requireWaiver: true,
    requireEmergencyContact: true,
  },
  notifications: {
    sendWelcomeEmail: true,
    sendRegistrationConfirmation: true,
    sendPaymentReceipts: true,
  },
}

export const DEFAULT_FEATURES: OrganizationFeatures = {
  enableDeposits: true,
  enableWaivers: true,
  enableTeamManagement: true,
  enableCoachPortal: true,
  enableOnlinePayments: true,
  enableScheduling: true,
}

// ============================================
// CONTEXT
// ============================================

const OrganizationContext = createContext<OrganizationContextValue | null>(null)

// ============================================
// PROVIDER
// ============================================

interface OrganizationProviderProps {
  children: ReactNode
  // Can be passed from server-side
  initialOrganization?: Organization | null
  initialLocation?: Location | null
}

export function OrganizationProvider({
  children,
  initialOrganization = null,
  initialLocation = null,
}: OrganizationProviderProps) {
  const [organization, setOrganization] = useState<Organization | null>(initialOrganization)
  const [location, setLocation] = useState<Location | null>(initialLocation)
  const [isLoading, setIsLoading] = useState(!initialOrganization)
  const [error, setError] = useState<string | null>(null)

  // Fetch organization if not provided
  useEffect(() => {
    if (initialOrganization) return

    async function fetchOrganization() {
      try {
        setIsLoading(true)
        const response = await fetch("/api/organization/current")
        if (!response.ok) throw new Error("Failed to fetch organization")
        const data = await response.json()
        setOrganization(data.organization)
        setLocation(data.location)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error")
        console.error("Failed to fetch organization:", err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchOrganization()
  }, [initialOrganization])

  // Inject CSS variables when organization changes
  useEffect(() => {
    if (!organization?.settings?.branding) return
    injectBrandingStyles(organization.settings.branding, location?.settings?.branding)
  }, [organization, location])

  // Computed values
  const settings = organization?.settings ?? DEFAULT_SETTINGS
  const features = organization?.features ?? DEFAULT_FEATURES
  const branding = settings.branding

  // Helper functions
  const isFeatureEnabled = (feature: keyof OrganizationFeatures): boolean => {
    const value = features?.[feature] ?? DEFAULT_FEATURES[feature]
    return typeof value === 'boolean' ? value : !!value
  }

  const getBrandingValue = <K extends keyof OrganizationSettings["branding"]>(
    key: K
  ): OrganizationSettings["branding"][K] | undefined => {
    // Location branding overrides org branding
    const locationValue = location?.settings?.branding?.[key]
    if (locationValue !== undefined) return locationValue as OrganizationSettings["branding"][K]
    return branding?.[key]
  }

  const value: OrganizationContextValue = {
    organization,
    isLoading,
    error,
    location,
    settings,
    features,
    branding,
    isFeatureEnabled,
    getBrandingValue,
  }

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  )
}

// ============================================
// HOOK
// ============================================

export function useOrganization(): OrganizationContextValue {
  const context = useContext(OrganizationContext)
  if (!context) {
    // Return default values if not in provider (for standalone pages)
    return {
      organization: null,
      isLoading: false,
      error: null,
      location: null,
      settings: DEFAULT_SETTINGS,
      features: DEFAULT_FEATURES,
      branding: DEFAULT_SETTINGS.branding,
      isFeatureEnabled: (feature) => {
        const value = DEFAULT_FEATURES[feature]
        return typeof value === 'boolean' ? value : !!value
      },
      getBrandingValue: (key) => DEFAULT_SETTINGS.branding[key],
    }
  }
  return context
}

// ============================================
// CSS VARIABLE INJECTION
// ============================================

function injectBrandingStyles(
  orgBranding: OrganizationSettings["branding"],
  locationBranding?: Partial<OrganizationSettings["branding"]>
) {
  // Merge location overrides
  const branding = { ...orgBranding, ...locationBranding }

  const root = document.documentElement

  // Color variables
  if (branding.primaryColor) {
    root.style.setProperty("--org-primary", branding.primaryColor)
    // Also set as CSS oklch if needed
    root.style.setProperty("--primary", branding.primaryColor)
  }

  if (branding.secondaryColor) {
    root.style.setProperty("--org-secondary", branding.secondaryColor)
  }

  if (branding.accentColor) {
    root.style.setProperty("--org-accent", branding.accentColor)
  }

  if (branding.backgroundColor) {
    root.style.setProperty("--org-background", branding.backgroundColor)
    root.style.setProperty("--background", branding.backgroundColor)
  }

  if (branding.textColor) {
    root.style.setProperty("--org-text", branding.textColor)
  }

  // Typography
  if (branding.fontFamily) {
    root.style.setProperty("--org-font-family", branding.fontFamily)
  }

  if (branding.headerFontFamily) {
    root.style.setProperty("--org-header-font-family", branding.headerFontFamily)
  }

  // Border radius
  if (branding.borderRadius) {
    root.style.setProperty("--org-border-radius", branding.borderRadius)
    root.style.setProperty("--radius", branding.borderRadius)
  }
}

// Server-side CSS generation (for SSR)
export function generateBrandingCSS(
  orgBranding?: OrganizationSettings["branding"],
  locationBranding?: Partial<OrganizationSettings["branding"]>
): string {
  const branding = { ...DEFAULT_SETTINGS.branding, ...orgBranding, ...locationBranding }

  return `
    :root {
      --org-primary: ${branding.primaryColor};
      --org-secondary: ${branding.secondaryColor || "#1a1a24"};
      --org-accent: ${branding.accentColor || "#f59e0b"};
      --org-background: ${branding.backgroundColor || "#0a0a0f"};
      --org-text: ${branding.textColor || "#ffffff"};
      --org-font-family: ${branding.fontFamily || "system-ui, sans-serif"};
      --org-header-font-family: ${branding.headerFontFamily || branding.fontFamily || "system-ui, sans-serif"};
      --org-border-radius: ${branding.borderRadius || "0.75rem"};
    }
  `.trim()
}
