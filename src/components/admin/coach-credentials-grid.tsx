"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

const CREDENTIAL_TYPES = [
  "safesport",
  "background_check",
  "cpr_first_aid",
  "concussion_protocol",
  "coaching_license",
  "other",
] as const;
type CredentialType = (typeof CREDENTIAL_TYPES)[number];

const TYPE_LABELS: Record<CredentialType, string> = {
  safesport: "SafeSport",
  background_check: "Background check",
  cpr_first_aid: "CPR / First aid",
  concussion_protocol: "Concussion",
  coaching_license: "License",
  other: "Other",
};

type StoredStatus = "pending" | "valid" | "expired" | "rejected";
type EffectiveStatus =
  | "missing"
  | "pending"
  | "valid"
  | "expiring_soon"
  | "expired"
  | "rejected";

interface CredentialCell {
  id: string;
  credentialType: CredentialType;
  status: StoredStatus;
  effectiveStatus: EffectiveStatus;
  issuedAt: string | null;
  expiresAt: string | null;
  documentKey: string | null;
  notes: string | null;
}

interface CoachRow {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  applicationCertifications: string | null;
  credentials: CredentialCell[];
  gaps: { credentialType: string; reason: string }[];
}

interface OnboardingTask {
  key: string;
  label: string;
  kind: "manual" | "auto" | "admin_confirm";
  completed: boolean;
  completedAt: string | null;
}

interface OnboardingSummary {
  id: string;
  tasks: OnboardingTask[];
  complete: boolean;
}

const STATUS_STYLES: Record<EffectiveStatus, string> = {
  valid: "bg-green-100 text-green-800",
  expiring_soon: "bg-amber-100 text-amber-800",
  pending: "bg-yellow-50 text-yellow-700",
  expired: "bg-red-100 text-red-800",
  rejected: "bg-red-100 text-red-800",
  missing: "bg-gray-100 text-gray-500",
};

const STATUS_LABELS: Record<EffectiveStatus, string> = {
  valid: "Valid",
  expiring_soon: "Expiring",
  pending: "Pending",
  expired: "Expired",
  rejected: "Rejected",
  missing: "—",
};

interface EditState {
  coach: CoachRow;
  credentialType: CredentialType;
  existing: CredentialCell | null;
  status: StoredStatus;
  issuedAt: string; // "YYYY-MM-DD" or ""
  expiresAt: string;
  notes: string;
}

export default function CoachCredentialsGrid() {
  const [coaches, setCoaches] = useState<CoachRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [saving, setSaving] = useState(false);
  const [onboarding, setOnboarding] = useState<Record<string, OnboardingSummary> | null>(null);
  const [onboardingEdit, setOnboardingEdit] = useState<OnboardingSummary | null>(null);
  const [confirmingShadow, setConfirmingShadow] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/coaches/credentials");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setCoaches((await res.json()).coaches);
      setError(null);
    } catch {
      setError("Could not load coach credentials.");
    }
  }, []);

  const loadOnboarding = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/coaches/onboarding");
      if (!res.ok) return; // fail-soft: onboarding column just won't render
      const data = await res.json();
      const byId: Record<string, OnboardingSummary> = {};
      for (const c of data.coaches as OnboardingSummary[]) byId[c.id] = c;
      setOnboarding(byId);
    } catch {
      // fail-soft
    }
  }, []);

  useEffect(() => {
    void load();
    void loadOnboarding();
  }, [load, loadOnboarding]);

  function openEditor(coach: CoachRow, credentialType: CredentialType) {
    const existing =
      coach.credentials.find((c) => c.credentialType === credentialType) ??
      null;
    setEdit({
      coach,
      credentialType,
      existing,
      status: existing?.status ?? "pending",
      issuedAt: existing?.issuedAt ? existing.issuedAt.slice(0, 10) : "",
      expiresAt: existing?.expiresAt ? existing.expiresAt.slice(0, 10) : "",
      notes: existing?.notes ?? "",
    });
  }

  async function save() {
    if (!edit) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/coaches/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: edit.coach.id,
          credentialType: edit.credentialType,
          status: edit.status,
          issuedAt: edit.issuedAt || null,
          expiresAt: edit.expiresAt || null,
          notes: edit.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      toast.success(`${TYPE_LABELS[edit.credentialType]} updated.`);
      setEdit(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorBanner message={error} />;
  if (!coaches) return <LoadingSkeleton />;
  if (coaches.length === 0)
    return (
      <EmptyState
        title="No coaches yet"
        description="Coaches appear here once they hold an organization coach role — mark an application hired, or invite one from Users & staff."
      />
    );

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-border">
              <th className="py-2 pr-4">Coach</th>
              <th className="py-2 pr-4 whitespace-nowrap">Onboarding</th>
              {CREDENTIAL_TYPES.map((t) => (
                <th key={t} className="py-2 pr-4 whitespace-nowrap">
                  {TYPE_LABELS[t]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {coaches.map((coach) => (
              <tr key={coach.id} className="border-b border-border/50 align-top">
                <td className="py-2 pr-4">
                  <div className="font-medium">
                    {coach.firstName || coach.lastName
                      ? `${coach.firstName ?? ""} ${coach.lastName ?? ""}`.trim()
                      : coach.email}
                  </div>
                  <div className="text-xs text-gray-500">{coach.email}</div>
                  {coach.applicationCertifications ? (
                    <div
                      className="mt-1 max-w-[16rem] text-xs text-gray-500"
                      title={coach.applicationCertifications}
                    >
                      From application:{" "}
                      {coach.applicationCertifications.slice(0, 80)}
                      {coach.applicationCertifications.length > 80 ? "…" : ""}
                    </div>
                  ) : null}
                </td>
                <td className="py-2 pr-4">
                  {onboarding?.[coach.id] ? (
                    <button
                      type="button"
                      onClick={() => setOnboardingEdit(onboarding[coach.id])}
                      className={`rounded px-2 py-1 text-xs font-medium ${
                        onboarding[coach.id].complete
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {onboarding[coach.id].tasks.filter((t) => t.completed).length}/
                      {onboarding[coach.id].tasks.length}
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400">—</span>
                  )}
                </td>
                {CREDENTIAL_TYPES.map((t) => {
                  const cred =
                    coach.credentials.find((c) => c.credentialType === t) ??
                    null;
                  const eff: EffectiveStatus =
                    cred?.effectiveStatus ?? "missing";
                  return (
                    <td key={t} className="py-2 pr-4">
                      <button
                        type="button"
                        onClick={() => openEditor(coach, t)}
                        className={`rounded px-2 py-1 text-xs font-medium ${STATUS_STYLES[eff]}`}
                        title={
                          cred?.expiresAt
                            ? `Expires ${new Date(cred.expiresAt).toLocaleDateString()}`
                            : "Click to record"
                        }
                      >
                        {STATUS_LABELS[eff]}
                        {eff === "expiring_soon" && cred?.expiresAt
                          ? ` ${new Date(cred.expiresAt).toLocaleDateString()}`
                          : ""}
                      </button>
                      {cred?.documentKey ? (
                        <a
                          className="ml-1 text-xs underline"
                          href={`/api/admin/coaches/credentials/${cred.id}/document`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          PDF
                        </a>
                      ) : null}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500">
        Required for every coach: SafeSport, background check, CPR/first aid,
        concussion protocol. Amber = valid but expires within 60 days.
      </p>

      <Dialog
        open={edit !== null}
        onOpenChange={(open) => {
          if (!open) setEdit(null);
        }}
      >
        <DialogContent>
          {edit ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {TYPE_LABELS[edit.credentialType]} —{" "}
                  {edit.coach.firstName || edit.coach.lastName
                    ? `${edit.coach.firstName ?? ""} ${edit.coach.lastName ?? ""}`.trim()
                    : edit.coach.email}
                </DialogTitle>
                <DialogDescription>
                  Setting status to Valid records you as the verifier.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="cred-status">Status</Label>
                  <Select
                    value={edit.status}
                    onValueChange={(value) =>
                      setEdit((prev) =>
                        prev
                          ? { ...prev, status: value as StoredStatus }
                          : prev,
                      )
                    }
                  >
                    <SelectTrigger id="cred-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="valid">Valid (verified)</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="cred-issued">Issued</Label>
                    <Input
                      id="cred-issued"
                      type="date"
                      value={edit.issuedAt}
                      onChange={(e) =>
                        setEdit((prev) =>
                          prev ? { ...prev, issuedAt: e.target.value } : prev,
                        )
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cred-expires">Expires</Label>
                    <Input
                      id="cred-expires"
                      type="date"
                      value={edit.expiresAt}
                      onChange={(e) =>
                        setEdit((prev) =>
                          prev ? { ...prev, expiresAt: e.target.value } : prev,
                        )
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cred-notes">Notes</Label>
                  <Textarea
                    id="cred-notes"
                    value={edit.notes}
                    onChange={(e) =>
                      setEdit((prev) =>
                        prev ? { ...prev, notes: e.target.value } : prev,
                      )
                    }
                    placeholder="Provider, reference number, follow-ups…"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEdit(null)}>
                  Cancel
                </Button>
                <Button onClick={() => void save()} disabled={saving}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={onboardingEdit !== null}
        onOpenChange={(open) => {
          if (!open) setOnboardingEdit(null);
        }}
      >
        <DialogContent>
          {onboardingEdit ? (
            <>
              <DialogHeader>
                <DialogTitle>Onboarding checklist</DialogTitle>
                <DialogDescription>
                  {onboardingEdit.tasks.filter((t) => t.completed).length}/
                  {onboardingEdit.tasks.length} complete.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                {onboardingEdit.tasks.map((task) => (
                  <div
                    key={task.key}
                    className="flex items-center justify-between text-sm py-1"
                  >
                    <span
                      className={task.completed ? "text-ink" : "text-gray-500"}
                    >
                      {task.label}
                    </span>
                    {task.completed ? (
                      <span className="text-xs text-green-700">Done</span>
                    ) : task.kind === "admin_confirm" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={confirmingShadow}
                        onClick={async () => {
                          setConfirmingShadow(true);
                          try {
                            const res = await fetch(
                              "/api/admin/coaches/onboarding",
                              {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                  userId: onboardingEdit.id,
                                  taskKey: task.key,
                                }),
                              },
                            );
                            if (!res.ok) throw new Error();
                            toast.success("Confirmed.");
                            await loadOnboarding();
                            setOnboardingEdit(null);
                          } catch {
                            toast.error("Could not confirm — try again.");
                          } finally {
                            setConfirmingShadow(false);
                          }
                        }}
                      >
                        Confirm
                      </Button>
                    ) : (
                      <span className="text-xs text-gray-400">Pending</span>
                    )}
                  </div>
                ))}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOnboardingEdit(null)}>
                  Close
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
