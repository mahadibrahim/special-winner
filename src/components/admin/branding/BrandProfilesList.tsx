"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { toast } from "sonner";

interface BrandProfile {
  id: string;
  domain: string;
  displayName: string;
  active: boolean;
  updatedAt: string;
}

export function BrandProfilesList() {
  useHydrationBeacon();

  const [rows, setRows] = useState<BrandProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [domain, setDomain] = useState("");
  const [displayName, setDisplayName] = useState("");

  const reload = async () => {
    try {
      const res = await fetch("/api/admin/branding");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setRows(json.brandProfiles ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const create = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/branding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: domain.trim().toLowerCase(),
          displayName: displayName.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Create failed");
        return;
      }
      toast.success("Created");
      setCreateOpen(false);
      setDomain("");
      setDisplayName("");
      window.location.href = `/admin/branding/${json.brandProfile.id}`;
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Branding</h1>
          <p className="text-sm text-ink-muted mt-1">
            Per-domain brand profiles. Each maps a hostname to a logo, hero
            copy, color tokens, and featured venues.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>+ New profile</Button>
      </header>

      {error && <ErrorBanner message={error} />}
      {loading && <LoadingSkeleton />}
      {!loading && rows.length === 0 && (
        <EmptyState
          title="No brand profiles yet"
          description="Add a profile per domain to override the default brand on that host."
        />
      )}
      {!loading && rows.length > 0 && (
        <div className="rounded-lg border border-border bg-cream-2 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream border-b border-border">
              <tr className="text-left">
                <th className="px-4 py-2 font-medium text-ink-muted">Display name</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Domain</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Status</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Updated</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-border hover:bg-cream/60"
                >
                  <td className="px-4 py-3 font-medium text-ink">
                    {r.displayName}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{r.domain}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={
                        r.active
                          ? "bg-emerald-100 text-emerald-900 border-emerald-200"
                          : "bg-stone-100 text-stone-700 border-stone-200"
                      }
                    >
                      {r.active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-ink-muted text-xs">
                    {new Date(r.updatedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={`/admin/branding/${r.id}`}
                      className="text-xs text-ink underline"
                    >
                      Edit
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New brand profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="domain">Domain</Label>
              <Input
                id="domain"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="aspiresportsohio.com"
              />
            </div>
            <div>
              <Label htmlFor="display-name">Display name</Label>
              <Input
                id="display-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Aspire Sports Ohio"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              onClick={create}
              disabled={busy || !domain.trim() || !displayName.trim()}
            >
              {busy ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
