"use client"

import { useState, useEffect } from "react"
import {
  Building2,
  Plus,
  MoreVertical,
  ExternalLink,
  Settings,
  CreditCard,
  MapPin,
  Users,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Clock,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import OrganizationForm from "./organization-form"

interface Organization {
  id: string
  name: string
  slug: string
  organizationType: string
  status: string
  logoUrl: string | null
  email: string | null
  city: string | null
  state: string | null
  stripeAccountId: string | null
  stripeAccountStatus: string | null
  stripeOnboardingComplete: boolean
  locationCount: number
  userCount: number
  createdAt: string
}

export default function OrganizationsList() {
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createDialogOpen, setCreateDialogOpen] = useState(false)

  useEffect(() => {
    fetchOrganizations()
  }, [])

  const fetchOrganizations = async () => {
    try {
      setIsLoading(true)
      const response = await fetch("/api/admin/organizations")
      if (!response.ok) throw new Error("Failed to fetch organizations")
      const data = await response.json()
      setOrganizations(data.organizations)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateSuccess = () => {
    setCreateDialogOpen(false)
    fetchOrganizations()
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof CheckCircle2 }> = {
      active: { variant: "default", icon: CheckCircle2 },
      pending: { variant: "secondary", icon: Clock },
      suspended: { variant: "destructive", icon: AlertCircle },
      inactive: { variant: "outline", icon: AlertCircle },
    }
    const config = variants[status] || variants.inactive
    const Icon = config.icon

    return (
      <Badge variant={config.variant} className="gap-1">
        <Icon className="w-3 h-3" />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </Badge>
    )
  }

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      headquarters: "bg-purple-500/20 text-purple-400 border-purple-500/30",
      franchise: "bg-blue-500/20 text-blue-400 border-blue-500/30",
      subsidiary: "bg-green-500/20 text-green-400 border-green-500/30",
      partner: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    }

    return (
      <Badge variant="outline" className={colors[type] || colors.franchise}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </Badge>
    )
  }

  const getStripeStatus = (org: Organization) => {
    if (!org.stripeAccountId) {
      return (
        <span className="flex items-center gap-1 text-xs text-gray-500">
          <CreditCard className="w-3 h-3" />
          Not Connected
        </span>
      )
    }

    if (org.stripeOnboardingComplete) {
      return (
        <span className="flex items-center gap-1 text-xs text-green-500">
          <CheckCircle2 className="w-3 h-3" />
          Payments Active
        </span>
      )
    }

    return (
      <span className="flex items-center gap-1 text-xs text-amber-500">
        <Clock className="w-3 h-3" />
        Onboarding Pending
      </span>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-20">
        <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
        <p className="text-destructive">{error}</p>
        <Button variant="outline" onClick={fetchOrganizations} className="mt-4">
          Try Again
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Organizations</h2>
          <p className="text-gray-400">Manage franchises, subsidiaries, and partner organizations</p>
        </div>

        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              Add Organization
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl bg-[#0a0a0f] border-white/10">
            <DialogHeader>
              <DialogTitle className="text-white">Create Organization</DialogTitle>
              <DialogDescription>
                Add a new franchise, subsidiary, or partner organization.
              </DialogDescription>
            </DialogHeader>
            <OrganizationForm onSuccess={handleCreateSuccess} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-white/[0.02] border-white/[0.06]">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{organizations.length}</p>
                <p className="text-xs text-gray-500">Total Organizations</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/[0.02] border-white/[0.06]">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">
                  {organizations.filter((o) => o.status === "active").length}
                </p>
                <p className="text-xs text-gray-500">Active</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/[0.02] border-white/[0.06]">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">
                  {organizations.filter((o) => o.stripeOnboardingComplete).length}
                </p>
                <p className="text-xs text-gray-500">Payments Active</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-white/[0.02] border-white/[0.06]">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">
                  {organizations.reduce((acc, o) => acc + o.locationCount, 0)}
                </p>
                <p className="text-xs text-gray-500">Total Locations</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Organizations List */}
      <div className="space-y-4">
        {organizations.length === 0 ? (
          <Card className="bg-white/[0.02] border-white/[0.06]">
            <CardContent className="py-12">
              <div className="text-center">
                <Building2 className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-white mb-2">No Organizations</h3>
                <p className="text-gray-400 mb-4">Get started by creating your first organization.</p>
                <Button onClick={() => setCreateDialogOpen(true)} className="gap-2">
                  <Plus className="w-4 h-4" />
                  Create Organization
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          organizations.map((org) => (
            <Card key={org.id} className="bg-white/[0.02] border-white/[0.06] hover:border-white/10 transition-colors">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4">
                    {/* Logo */}
                    <div className="w-14 h-14 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden">
                      {org.logoUrl ? (
                        <img src={org.logoUrl} alt={org.name} className="w-full h-full object-cover" />
                      ) : (
                        <Building2 className="w-6 h-6 text-gray-500" />
                      )}
                    </div>

                    {/* Info */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-white">{org.name}</h3>
                        {getTypeBadge(org.organizationType)}
                        {getStatusBadge(org.status)}
                      </div>

                      <div className="flex items-center gap-4 text-sm text-gray-400">
                        {org.city && org.state && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {org.city}, {org.state}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {org.locationCount} location{org.locationCount !== 1 ? "s" : ""}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {org.userCount} user{org.userCount !== 1 ? "s" : ""}
                        </span>
                      </div>

                      <div className="flex items-center gap-4">
                        {getStripeStatus(org)}
                        <span className="text-xs text-gray-500">
                          Created {new Date(org.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-gray-400 hover:text-white">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-[#1a1a24] border-white/10">
                      <DropdownMenuItem asChild>
                        <a href={`/admin/organizations/${org.id}`} className="flex items-center gap-2 cursor-pointer">
                          <Settings className="w-4 h-4" />
                          Manage
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <a href={`/admin/organizations/${org.id}/locations`} className="flex items-center gap-2 cursor-pointer">
                          <MapPin className="w-4 h-4" />
                          Locations
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <a href={`/admin/organizations/${org.id}/stripe`} className="flex items-center gap-2 cursor-pointer">
                          <CreditCard className="w-4 h-4" />
                          Payments
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator className="bg-white/10" />
                      <DropdownMenuItem asChild>
                        <a
                          href={`https://${org.slug}.aspiresports.com`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <ExternalLink className="w-4 h-4" />
                          View Site
                        </a>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
