"use client"

import { useState } from "react"
import { Settings, Building2, Bell, CreditCard, Shield, Mail } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

export function AdminSettings() {
  const [activeTab, setActiveTab] = useState("general")

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600 mt-1">Manage organization settings and preferences</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full max-w-2xl grid-cols-4">
          <TabsTrigger value="general" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">General</span>
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <span className="hidden sm:inline">Notifications</span>
          </TabsTrigger>
          <TabsTrigger value="payments" className="flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">Payments</span>
          </TabsTrigger>
          <TabsTrigger value="security" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Security</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>Organization Settings</CardTitle>
              <CardDescription>Manage your organization details and branding</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-8 text-center border-2 border-dashed rounded-lg">
                <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold text-lg mb-2">Organization Settings</h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Organization settings are managed at the organization level.
                  Contact your administrator to modify organization details.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Settings</CardTitle>
              <CardDescription>Configure email notifications and alerts</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-8 text-center border-2 border-dashed rounded-lg">
                <Mail className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold text-lg mb-2">Email Notifications</h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Email notifications are sent automatically for registrations,
                  payments, and announcements. Configure your email templates
                  and preferences.
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <CardTitle>Payment Settings</CardTitle>
              <CardDescription>Configure Stripe and payment options</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-8 text-center border-2 border-dashed rounded-lg">
                <CreditCard className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold text-lg mb-2">Stripe Integration</h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Payment processing is handled through Stripe.
                  Visit your Stripe dashboard to manage payment settings,
                  view transactions, and configure payouts.
                </p>
                <a
                  href="https://dashboard.stripe.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 mt-4 text-primary hover:underline"
                >
                  Open Stripe Dashboard
                </a>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security">
          <Card>
            <CardHeader>
              <CardTitle>Security Settings</CardTitle>
              <CardDescription>Manage access controls and security options</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-8 text-center border-2 border-dashed rounded-lg">
                <Shield className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="font-semibold text-lg mb-2">Security Configuration</h3>
                <p className="text-muted-foreground max-w-md mx-auto">
                  Security settings are managed system-wide.
                  User roles and permissions can be configured in the Users section.
                </p>
                <a
                  href="/admin/users"
                  className="inline-flex items-center gap-2 mt-4 text-primary hover:underline"
                >
                  Manage Users & Roles
                </a>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
