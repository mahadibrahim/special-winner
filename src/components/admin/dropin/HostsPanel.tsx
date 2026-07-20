"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { toast } from "sonner";

interface UserSearchRow {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

interface HostRow {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  status: "active" | "paused" | "revoked";
  preferredVenueId: string | null;
  venueName: string | null;
  gamesHosted: number;
  lastReportAt: string | null;
  incidentCount: number;
  avgRating: number | null;
  ratingCount: number;
}

function statusColor(s: HostRow["status"]): string {
  switch (s) {
    case "active":
      return "bg-emerald-100 text-emerald-900 border-emerald-200";
    case "paused":
      return "bg-amber-100 text-amber-900 border-amber-200";
    case "revoked":
      return "bg-rose-100 text-rose-900 border-rose-200";
  }
}

function AddHostDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => Promise<void> | void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length === 0) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    // Stale-response guard: each debounce cycle gets its own
    // AbortController, aborted in the cleanup below whenever `query` or
    // `open` changes again (including on dialog close/reopen). Without
    // this, a slow earlier request can resolve after a newer one and
    // overwrite fresher results, or resolve after the dialog is closed
    // and reopened and clobber the freshly-reset empty state.
    const controller = new AbortController();
    const handle = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/admin/users?search=${encodeURIComponent(q)}&limit=8`,
          { signal: controller.signal },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (controller.signal.aborted) return;
        setResults(json.users ?? []);
        setSearching(false);
      } catch {
        if (controller.signal.aborted) return;
        toast.error("Search failed");
        setSearching(false);
      }
    }, 300);
    return () => {
      clearTimeout(handle);
      controller.abort();
    };
  }, [query, open]);

  const addHost = async (user: UserSearchRow) => {
    setAddingId(user.id);
    try {
      const res = await fetch("/api/admin/hosts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });
      const json = await res.json();
      if (res.status === 409) {
        toast.error("Already a host");
        return;
      }
      if (res.status === 404) {
        toast.error(
          "This person must already be a member of this organization before they can be added as a host.",
        );
        return;
      }
      if (!res.ok) {
        toast.error(json.error ?? "Could not add host");
        return;
      }
      toast.success(
        `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() +
          " added as host",
      );
      await onAdded();
      onOpenChange(false);
    } finally {
      setAddingId(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add host manually</DialogTitle>
          <DialogDescription>
            For people you already know. New volunteers should apply at
            /host so they&apos;re vetted.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Search by name or email…"
            aria-label="Search members by name or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="min-h-[2.5rem]">
            {searching && (
              <p className="text-sm text-ink-muted">Searching…</p>
            )}
            {!searching && query.trim().length > 0 && results.length === 0 && (
              <p className="text-sm text-ink-muted">No matches.</p>
            )}
            {!searching && results.length > 0 && (
              <ul className="divide-y divide-border rounded-md border border-border overflow-hidden">
                {results.map((u) => (
                  <li
                    key={u.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 bg-cream-2"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-ink truncate">
                        {u.firstName ?? ""} {u.lastName ?? ""}
                      </div>
                      <div className="text-xs text-ink-muted truncate">
                        {u.email}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={addingId === u.id}
                      onClick={() => addHost(u)}
                    >
                      Add
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function HostsPanel() {
  useHydrationBeacon();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [rows, setRows] = useState<HostRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [unhostedUpcoming, setUnhostedUpcoming] = useState(0);
  const [addHostOpen, setAddHostOpen] = useState(false);

  const load = async () => {
    try {
      const res = await fetch("/api/admin/hosts");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setRows(json.hosts ?? []);
      setUnhostedUpcoming(json.unhostedUpcoming ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const setStatus = async (
    row: HostRow,
    status: "active" | "paused" | "revoked",
  ) => {
    if (status !== "active") {
      const ok = await confirm({
        title: status === "revoked" ? "Revoke host?" : "Pause host?",
        description:
          status === "revoked"
            ? `${row.firstName} ${row.lastName} will be removed from every future session they're hosting and can no longer claim games. This cannot be undone.`
            : `${row.firstName} ${row.lastName} will be removed from every future session they're hosting and can't claim new games until reactivated.`,
        confirmLabel: status === "revoked" ? "Revoke" : "Pause",
        destructive: true,
      });
      if (!ok) return;
    }
    setBusyId(row.id);
    try {
      const res = await fetch(`/api/admin/hosts/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Update failed");
        return;
      }
      const suffix =
        json.unassignedSessions > 0
          ? ` · unassigned from ${json.unassignedSessions} upcoming session${json.unassignedSessions === 1 ? "" : "s"}`
          : "";
      toast.success(`Host ${status}${suffix}`);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-ink">Pickup hosts</h1>
          <p className="text-sm text-ink-muted mt-1">
            Community volunteers who run drop-in games. Approved via the ATS
            hiring flow.
          </p>
          {unhostedUpcoming > 0 && (
            <p className="text-sm text-ink-muted mt-2">
              {unhostedUpcoming} upcoming pickup session
              {unhostedUpcoming === 1 ? "" : "s"} without a host —{" "}
              <a className="underline" href="/admin/dropins">
                view schedule
              </a>
              .
            </p>
          )}
        </div>
        <Button variant="outline" onClick={() => setAddHostOpen(true)}>
          Add host manually
        </Button>
      </div>

      {error && <ErrorBanner message={error} />}
      {confirmDialog}
      <AddHostDialog
        open={addHostOpen}
        onOpenChange={setAddHostOpen}
        onAdded={load}
      />
      {loading && <LoadingSkeleton />}
      {!loading && rows.length === 0 && (
        <EmptyState
          title="No hosts yet"
          description="Approved host applicants appear here once they're onboarded."
        />
      )}
      {!loading && rows.length > 0 && (
        <div className="rounded-lg border border-border bg-cream-2 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-cream border-b border-border">
              <tr className="text-left">
                <th className="px-4 py-2 font-medium text-ink-muted">Host</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Status</th>
                <th className="px-4 py-2 font-medium text-ink-muted">
                  Preferred venue
                </th>
                <th className="px-4 py-2 font-medium text-ink-muted">
                  Games hosted
                </th>
                <th className="px-4 py-2 font-medium text-ink-muted">
                  Last report
                </th>
                <th className="px-4 py-2 font-medium text-ink-muted">
                  Incidents
                </th>
                <th className="px-4 py-2 font-medium text-ink-muted">
                  Rating
                </th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-border hover:bg-cream/60"
                >
                  <td className="px-4 py-3 align-top">
                    <div className="font-medium text-ink">
                      {r.firstName} {r.lastName}
                    </div>
                    <div className="text-xs text-ink-muted">{r.email}</div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <Badge variant="outline" className={statusColor(r.status)}>
                      {r.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 align-top text-ink-muted">
                    {r.venueName ?? "—"}
                  </td>
                  <td className="px-4 py-3 align-top text-ink-muted">
                    {r.gamesHosted}
                  </td>
                  <td className="px-4 py-3 align-top text-ink-muted">
                    {r.lastReportAt
                      ? new Date(r.lastReportAt).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-4 py-3 align-top text-ink-muted">
                    {r.incidentCount > 0 ? (
                      <Badge className="bg-rose-100 text-rose-900 border-rose-200">
                        {r.incidentCount}
                      </Badge>
                    ) : (
                      0
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-ink-muted">
                    {r.avgRating != null ? (
                      `★ ${r.avgRating} (${r.ratingCount})`
                    ) : (
                      <span className="text-ink-muted">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    <div className="flex justify-end gap-2">
                      {r.status !== "active" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === r.id}
                          onClick={() => setStatus(r, "active")}
                        >
                          Reactivate
                        </Button>
                      )}
                      {r.status !== "paused" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === r.id}
                          onClick={() => setStatus(r, "paused")}
                        >
                          Pause
                        </Button>
                      )}
                      {r.status !== "revoked" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === r.id}
                          onClick={() => setStatus(r, "revoked")}
                          className="text-rose-700"
                        >
                          Revoke
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
