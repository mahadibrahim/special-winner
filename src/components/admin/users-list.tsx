"use client"

import { useState, useEffect } from "react"
import { Search, Loader2, Shield, ChevronLeft, ChevronRight, Mail, Phone, Plus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { useConfirmDialog } from "@/components/ui/confirm-dialog"

interface UserRole {
  id: string
  roleId: string
  scopeType: string
  scopeId: string | null
  roleName: string
}

interface User {
  id: string
  email: string
  emailVerified: boolean
  firstName: string | null
  lastName: string | null
  phone: string | null
  createdAt: string
  roles: UserRole[]
  /** Derived from family_members: parent (has dependents) / player (self row). */
  personType: "parent" | "player" | null
}

interface Pagination {
  page: number
  limit: number
  totalCount: number
  totalPages: number
}

const roleColors: Record<string, string> = {
  super_admin: "bg-red-100 text-red-800 border-red-200",
  location_admin: "bg-orange-100 text-orange-800 border-orange-200",
  coach: "bg-blue-100 text-blue-800 border-blue-200",
  parent: "bg-green-100 text-green-800 border-green-200",
  player: "bg-purple-100 text-purple-800 border-purple-200",
}

const roleLabels: Record<string, string> = {
  super_admin: "Super Admin",
  location_admin: "Location Admin",
  coach: "Coach",
  parent: "Parent",
  player: "Player",
}

export function UsersList() {
  const { confirm, dialog: confirmDialog } = useConfirmDialog()
  const [users, setUsers] = useState<User[]>([])
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    totalCount: 0,
    totalPages: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [searchDebounce, setSearchDebounce] = useState("")
  const [selectedUser, setSelectedUser] = useState<User | null>(null)
  const [isRoleDialogOpen, setIsRoleDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [newRole, setNewRole] = useState("parent")
  const [typeFilter, setTypeFilter] = useState("all")
  const [isInviteOpen, setIsInviteOpen] = useState(false)
  const [invite, setInvite] = useState({ firstName: "", lastName: "", email: "", roleName: "none" })
  const [isInviting, setIsInviting] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounce(search)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    fetchUsers(1)
  }, [searchDebounce, typeFilter])

  async function fetchUsers(page: number) {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ page: page.toString() })
      if (searchDebounce) params.set("search", searchDebounce)
      if (typeFilter !== "all") params.set("filter", typeFilter)

      const response = await fetch(`/api/admin/users?${params}`)
      if (!response.ok) throw new Error("Failed to fetch users")
      const data = await response.json()
      setUsers(data.users)
      setPagination(data.pagination)
    } catch (err) {
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  async function handleAssignRole() {
    if (!selectedUser) return
    setIsSubmitting(true)

    try {
      // super_admin is a platform-wide role (scopeType=global). All other
      // roles default to org-scope on the current organization — the API
      // fills in the scopeId server-side from the request's org context.
      const scopeType = newRole === "super_admin" ? "global" : "organization"

      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: selectedUser.id,
          roleName: newRole,
          scopeType,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "Failed to assign role")
      }

      await fetchUsers(pagination.page)
      setIsRoleDialogOpen(false)
    } catch (err: any) {
      toast.error(err.message ?? "Failed to assign role")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleRemoveRole(userRoleId: string) {
    const ok = await confirm({
      title: "Remove role?",
      description: "Are you sure you want to remove this role?",
      confirmLabel: "Remove",
      destructive: true,
    })
    if (!ok) return

    try {
      const response = await fetch(`/api/admin/users?userRoleId=${userRoleId}`, {
        method: "DELETE",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to remove role")
      }

      await fetchUsers(pagination.page)
      toast.success("Role removed")
    } catch (err: any) {
      toast.error(err.message ?? "Failed to remove role")
    }
  }

  async function handleInvite() {
    setIsInviting(true)
    try {
      const response = await fetch("/api/admin/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: invite.firstName,
          lastName: invite.lastName,
          email: invite.email,
          ...(invite.roleName !== "none" ? { roleName: invite.roleName } : {}),
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to add user")
      toast.success(`Invited ${invite.email} — they'll get a sign-in link by email`)
      setIsInviteOpen(false)
      setInvite({ firstName: "", lastName: "", email: "", roleName: "none" })
      await fetchUsers(1)
    } catch (err: any) {
      toast.error(err.message ?? "Failed to add user")
    } finally {
      setIsInviting(false)
    }
  }

  function openRoleDialog(user: User) {
    setSelectedUser(user)
    setNewRole("parent")
    setIsRoleDialogOpen(true)
  }

  return (
    <div className="space-y-6">
      {confirmDialog}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Users</h1>
          <p className="text-gray-600 mt-1">Manage users and their roles</p>
        </div>
        <Button onClick={() => setIsInviteOpen(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add user
        </Button>
      </div>

      {/* Search + type filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-md flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[190px]">
            <SelectValue placeholder="All users" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All users</SelectItem>
            <SelectItem value="parent">Parents (have kids)</SelectItem>
            <SelectItem value="player">Players (adults)</SelectItem>
            <SelectItem value="location_admin">Location admins</SelectItem>
            <SelectItem value="coach">Coaches</SelectItem>
            <SelectItem value="referee">Referees</SelectItem>
            <SelectItem value="media_staff">Media staff</SelectItem>
            <SelectItem value="super_admin">Super admins</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : users.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">
              {searchDebounce ? "No users found matching your search" : "No users registered yet"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid gap-4">
            {users.map((user) => (
              <Card key={user.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-gray-600 font-medium text-lg">
                        {user.firstName?.[0] || user.email[0].toUpperCase()}
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-900">
                          {user.firstName && user.lastName
                            ? `${user.firstName} ${user.lastName}`
                            : user.email}
                        </h3>
                        <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {user.email}
                            {user.emailVerified && (
                              <Badge variant="outline" className="ml-1 text-xs">Verified</Badge>
                            )}
                          </span>
                          {user.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="h-3 w-3" />
                              {user.phone}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {user.personType && (
                            <Badge
                              variant="outline"
                              className={roleColors[user.personType] || "bg-gray-100"}
                            >
                              {user.personType === "parent" ? "Parent" : "Player"}
                            </Badge>
                          )}
                          {user.roles
                            .filter((role) =>
                              // The parent role was historically auto-granted to
                              // every signup; the derived badge above is the
                              // trustworthy signal, so hide the stale role chip.
                              role.roleName !== "parent",
                            )
                            .map((role) => (
                            <Badge
                              key={role.id}
                              variant="outline"
                              className={`${roleColors[role.roleName] || "bg-gray-100"} flex items-center gap-1`}
                            >
                              <Shield className="h-3 w-3" />
                              {roleLabels[role.roleName] || role.roleName}
                              <button
                                onClick={() => handleRemoveRole(role.id)}
                                className="ml-1 hover:bg-black/10 rounded-full p-0.5"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                          {user.roles.length === 0 && !user.personType && (
                            <span className="text-sm text-muted-foreground">No roles assigned</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => openRoleDialog(user)}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Role
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
                {Math.min(pagination.page * pagination.limit, pagination.totalCount)} of{" "}
                {pagination.totalCount} users
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchUsers(pagination.page - 1)}
                  disabled={pagination.page === 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchUsers(pagination.page + 1)}
                  disabled={pagination.page === pagination.totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Add user (invite) dialog */}
      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add user</DialogTitle>
            <DialogDescription>
              Creates the account and emails them a sign-in link (valid 72
              hours) — you never handle their password.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="invite-first">First name</Label>
                <Input
                  id="invite-first"
                  value={invite.firstName}
                  onChange={(e) => setInvite({ ...invite, firstName: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-last">Last name</Label>
                <Input
                  id="invite-last"
                  value={invite.lastName}
                  onChange={(e) => setInvite({ ...invite, lastName: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={invite.email}
                onChange={(e) => setInvite({ ...invite, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Staff role (optional)</Label>
              <Select
                value={invite.roleName}
                onValueChange={(v) => setInvite({ ...invite, roleName: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No role (customer account)</SelectItem>
                  <SelectItem value="location_admin">Location admin (front desk)</SelectItem>
                  <SelectItem value="coach">Coach</SelectItem>
                  <SelectItem value="referee">Referee</SelectItem>
                  <SelectItem value="media_staff">Media staff</SelectItem>
                  <SelectItem value="media_editor">Media editor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsInviteOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleInvite}
              disabled={isInviting || !invite.firstName || !invite.lastName || !invite.email}
            >
              {isInviting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending invite...
                </>
              ) : (
                "Add & send invite"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Role Dialog */}
      <Dialog open={isRoleDialogOpen} onOpenChange={setIsRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Role</DialogTitle>
            <DialogDescription>
              Assign a new role to {selectedUser?.firstName || selectedUser?.email}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={newRole} onValueChange={setNewRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="super_admin">Super Admin</SelectItem>
                  <SelectItem value="location_admin">Location Admin</SelectItem>
                  <SelectItem value="coach">Coach</SelectItem>
                  <SelectItem value="parent">Parent</SelectItem>
                  <SelectItem value="player">Player</SelectItem>
                  <SelectItem value="referee">Referee</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRoleDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssignRole} disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Assigning...
                </>
              ) : (
                "Assign Role"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
