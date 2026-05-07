"use client";

import { useState, useEffect, useMemo } from "react";
import { Plus, Loader2, MapPin, UserMinus, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { toast } from "sonner";

interface CatalogRole {
  id: string;
  name: string;
  tier: string;
  kind: string;
  description: string;
}

interface OrgUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

interface Assignment {
  id: string;
  organizationId: string;
  venueId: string;
  roleId: string;
  userId: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  notes: string | null;
  createdAt: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
}

interface Props {
  venueId: string;
  venueName: string;
  locationName: string;
}

function formatUser(u: { firstName: string | null; lastName: string | null; email: string }): string {
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.email;
}

export function RoleAssignmentsList({ venueId, venueName, locationName }: Props) {
  useHydrationBeacon();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [roles, setRoles] = useState<CatalogRole[]>([]);
  const [orgUsers, setOrgUsers] = useState<OrgUser[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [formRoleId, setFormRoleId] = useState<string>("");
  const [formUserId, setFormUserId] = useState<string>("");
  const [formNotes, setFormNotes] = useState<string>("");

  useEffect(() => {
    void fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venueId]);

  async function fetchAll() {
    setLoadError(null);
    try {
      const [assignmentsRes, rolesRes, usersRes] = await Promise.all([
        fetch(`/api/admin/venues/${venueId}/role-assignments`),
        fetch("/api/catalog/roles?kind=worker"),
        fetch("/api/admin/users?limit=200"),
      ]);

      if (!assignmentsRes.ok) {
        throw new Error(`Failed to load assignments (${assignmentsRes.status})`);
      }
      if (!rolesRes.ok) {
        throw new Error(`Failed to load roles (${rolesRes.status})`);
      }
      if (!usersRes.ok) {
        throw new Error(`Failed to load users (${usersRes.status})`);
      }

      const assignmentsJson = await assignmentsRes.json();
      const rolesJson = await rolesRes.json();
      const usersJson = await usersRes.json();

      setAssignments(assignmentsJson.assignments ?? []);
      setRoles(rolesJson.roles ?? []);
      setOrgUsers(usersJson.users ?? []);
    } catch (err) {
      console.error(err);
      setLoadError(err instanceof Error ? err.message : "Failed to load page");
    }
  }

  function openCreateDialog() {
    setSubmitError(null);
    setFormRoleId(roles[0]?.id ?? "");
    setFormUserId(orgUsers[0]?.id ?? "");
    setFormNotes("");
    setIsDialogOpen(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    if (!formRoleId || !formUserId) {
      setSubmitError("Role and user are required");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/admin/venues/${venueId}/role-assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roleId: formRoleId,
          userId: formUserId,
          notes: formNotes || null,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error ?? "Failed to create assignment");
      }
      await fetchAll();
      setIsDialogOpen(false);
      toast.success("Assignment added");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleEnd(a: Assignment) {
    const role = roles.find((r) => r.id === a.roleId);
    const ok = await confirm({
      title: "End assignment?",
      description: (
        <>
          End <strong>{formatUser(a.user)}</strong>'s assignment as{" "}
          <strong>{role?.name ?? a.roleId}</strong> at <strong>{venueName}</strong>?
        </>
      ),
      confirmLabel: "End assignment",
      destructive: true,
    });
    if (!ok) return;

    try {
      const res = await fetch(
        `/api/admin/venues/${venueId}/role-assignments/${a.id}`,
        { method: "PATCH" },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Failed to end assignment");
      }
      await fetchAll();
      toast.success("Assignment ended");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to end assignment");
    }
  }

  const roleNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of roles) m.set(r.id, r.name);
    return m;
  }, [roles]);

  return (
    <div className="space-y-6">
      {confirmDialog}

      <div>
        <a
          href="/admin/venues"
          className="inline-flex items-center text-sm text-muted-foreground hover:underline mb-2"
        >
          <ArrowLeft className="h-3 w-3 mr-1" />
          Back to venues
        </a>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Staff at {venueName}</h1>
            <p className="text-gray-600 mt-1 flex items-center gap-1">
              <MapPin className="h-3 w-3" />
              {locationName}
            </p>
          </div>
          <Button onClick={openCreateDialog} disabled={roles.length === 0 || orgUsers.length === 0}>
            <Plus className="h-4 w-4 mr-2" />
            Add assignment
          </Button>
        </div>
      </div>

      {loadError && <ErrorBanner message={loadError} />}

      {assignments === null ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : assignments.length === 0 ? (
        <EmptyState
          title="No staff assigned yet"
          description="Add the first role assignment so the activity tracker can route messages to the right people."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {assignments.map((a) => (
            <Card key={a.id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{formatUser(a.user)}</CardTitle>
                <CardDescription>{a.user.email}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-sm font-medium mb-1">
                  {roleNameById.get(a.roleId) ?? a.roleId}
                </div>
                <div className="text-xs text-muted-foreground mb-3 font-mono">{a.roleId}</div>
                {a.notes && (
                  <p className="text-sm text-muted-foreground mb-3">{a.notes}</p>
                )}
                <div className="text-xs text-muted-foreground mb-3">
                  Active since {new Date(a.effectiveFrom).toLocaleDateString()}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleEnd(a)}
                  className="w-full"
                >
                  <UserMinus className="h-4 w-4 mr-2" />
                  End assignment
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add staff assignment</DialogTitle>
            <DialogDescription>
              Assign a user to a role at {venueName}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit}>
            {submitError && (
              <div className="mb-4">
                <ErrorBanner message={submitError} />
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="roleId">Role</Label>
                <Select value={formRoleId} onValueChange={setFormRoleId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a role" />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}{" "}
                        <span className="text-xs text-muted-foreground ml-1">
                          {r.id}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="userId">User</Label>
                <Select value={formUserId} onValueChange={setFormUserId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a user" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgUsers.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {formatUser(u)}{" "}
                        <span className="text-xs text-muted-foreground ml-1">
                          {u.email}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes (optional)</Label>
                <Input
                  id="notes"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Schedule, contact preference, etc."
                />
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Add assignment"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
