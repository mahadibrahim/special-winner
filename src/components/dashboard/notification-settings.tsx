"use client"

import { useState, useEffect } from "react"
import { Loader2, AlertCircle, CheckCircle, Bell, Mail, Megaphone, Calendar, CreditCard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

interface NotificationPreferences {
  emailRegistrationConfirmation: boolean
  emailPaymentReceipts: boolean
  emailScheduleReminders: boolean
  emailAnnouncements: boolean
  emailWeeklyDigest: boolean
}

const defaultPreferences: NotificationPreferences = {
  emailRegistrationConfirmation: true,
  emailPaymentReceipts: true,
  emailScheduleReminders: true,
  emailAnnouncements: true,
  emailWeeklyDigest: false,
}

export function NotificationSettings() {
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultPreferences)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    fetchPreferences()
  }, [])

  async function fetchPreferences() {
    try {
      const response = await fetch("/api/user/notification-preferences")
      if (response.ok) {
        const data = await response.json()
        setPreferences({ ...defaultPreferences, ...data.preferences })
      }
    } catch (err) {
      console.error("Failed to load notification preferences:", err)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSave() {
    setIsSaving(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch("/api/user/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(preferences),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to save preferences")
      }

      setSuccess("Notification preferences saved")
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsSaving(false)
    }
  }

  function updatePreference(key: keyof NotificationPreferences, value: boolean) {
    setPreferences((prev) => ({ ...prev, [key]: value }))
    setSuccess(null)
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Notification Settings
        </CardTitle>
        <CardDescription>Choose which emails you'd like to receive</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {error && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-4 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-500/10 border border-green-500/20 text-green-600 text-sm p-4 rounded-lg flex items-center gap-2">
            <CheckCircle className="w-4 h-4 flex-shrink-0" />
            {success}
          </div>
        )}

        <div className="space-y-4">
          {/* Registration Confirmations */}
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <Label htmlFor="email-registration" className="font-medium">
                  Registration Confirmations
                </Label>
                <p className="text-sm text-muted-foreground">
                  Receive confirmation when you register for a program
                </p>
              </div>
            </div>
            <Checkbox
              id="email-registration"
              checked={preferences.emailRegistrationConfirmation}
              onCheckedChange={(checked: boolean) => updatePreference("emailRegistrationConfirmation", checked)}
              className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            />
          </div>

          {/* Payment Receipts */}
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-3">
              <CreditCard className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <Label htmlFor="email-payments" className="font-medium">
                  Payment Receipts
                </Label>
                <p className="text-sm text-muted-foreground">
                  Receive receipts for payments and refunds
                </p>
              </div>
            </div>
            <Checkbox
              id="email-payments"
              checked={preferences.emailPaymentReceipts}
              onCheckedChange={(checked: boolean) => updatePreference("emailPaymentReceipts", checked)}
              className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            />
          </div>

          {/* Schedule Reminders */}
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <Label htmlFor="email-schedule" className="font-medium">
                  Schedule Reminders
                </Label>
                <p className="text-sm text-muted-foreground">
                  Get reminders for upcoming games and practices
                </p>
              </div>
            </div>
            <Checkbox
              id="email-schedule"
              checked={preferences.emailScheduleReminders}
              onCheckedChange={(checked: boolean) => updatePreference("emailScheduleReminders", checked)}
              className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            />
          </div>

          {/* Announcements */}
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-3">
              <Megaphone className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <Label htmlFor="email-announcements" className="font-medium">
                  Announcements
                </Label>
                <p className="text-sm text-muted-foreground">
                  Important updates from coaches and administrators
                </p>
              </div>
            </div>
            <Checkbox
              id="email-announcements"
              checked={preferences.emailAnnouncements}
              onCheckedChange={(checked: boolean) => updatePreference("emailAnnouncements", checked)}
              className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            />
          </div>

          {/* Weekly Digest */}
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-3">
              <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <Label htmlFor="email-digest" className="font-medium">
                  Weekly Digest
                </Label>
                <p className="text-sm text-muted-foreground">
                  A weekly summary of your upcoming activities
                </p>
              </div>
            </div>
            <Checkbox
              id="email-digest"
              checked={preferences.emailWeeklyDigest}
              onCheckedChange={(checked: boolean) => updatePreference("emailWeeklyDigest", checked)}
              className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            />
          </div>
        </div>

        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Preferences"
          )}
        </Button>
      </CardContent>
    </Card>
  )
}
