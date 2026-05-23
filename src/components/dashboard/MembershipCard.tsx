"use client";

import { useEffect, useState } from "react";
import { Shield, Pause, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { DashboardCard } from "@/components/dashboard/shell/DashboardCard";
import { toast } from "sonner";

interface Membership {
  id: string;
  status: "active" | "paused" | "past_due" | "incomplete";
  billingInterval: "month" | "year";
  currentPeriodEnd: string | null;
  pausedAt: string | null;
  pauseResumesAt: string | null;
  cancelAtPeriodEnd: boolean;
  tier: { id: string; name: string; benefits: Record<string, unknown> };
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function MembershipCard() {
  const [membership, setMembership] = useState<Membership | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<"pause" | "cancel" | null>(null);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/memberships");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      setMembership(body.membership);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load membership");
    } finally {
      setLoading(false);
    }
  }

  async function onCancel() {
    if (!confirm("Cancel at the end of your current billing period?")) return;
    setActing("cancel");
    try {
      const res = await fetch("/api/memberships/cancel", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("Cancellation scheduled — access continues until period end");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel");
    } finally {
      setActing(null);
    }
  }

  async function onPause() {
    setActing("pause");
    try {
      const res = await fetch("/api/memberships/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("Membership paused");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not pause");
    } finally {
      setActing(null);
    }
  }

  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorBanner message={error} />;
  if (!membership) return null;

  const isCancelling = membership.cancelAtPeriodEnd;
  const periodLabel = isCancelling
    ? `Ends ${fmtDate(membership.currentPeriodEnd)}`
    : `Renews ${fmtDate(membership.currentPeriodEnd)}`;
  const statusLabel =
    membership.status === "paused"
      ? `Paused${membership.pauseResumesAt ? ` until ${fmtDate(membership.pauseResumesAt)}` : ""}`
      : membership.status === "past_due"
        ? "Past due"
        : membership.status === "incomplete"
          ? "Setting up"
          : isCancelling
            ? "Cancelling"
            : "Active";

  return (
    <DashboardCard
      icon={Shield}
      eyebrow="Membership"
      title={membership.tier.name}
      meta={`${periodLabel} · ${membership.billingInterval === "month" ? "Monthly" : "Annual"}`}
      status={{
        label: statusLabel,
        // StatusTone in src/lib/dashboard/dashboard-ui.ts is "confirmed" | "action" | "pending".
        // No "warning" variant — using "action" (amber) for past_due as the closest semantic match.
        tone:
          membership.status === "active" && !isCancelling
            ? "confirmed"
            : membership.status === "past_due"
              ? "action"
              : "pending",
      }}
      action={
        <div className="flex gap-2">
          {membership.status === "active" && !isCancelling && (
            <>
              <Button variant="outline" size="sm" onClick={onPause} disabled={acting !== null}>
                <Pause className="w-3.5 h-3.5 mr-1" />
                Pause
              </Button>
              <Button variant="outline" size="sm" onClick={onCancel} disabled={acting !== null}>
                <X className="w-3.5 h-3.5 mr-1" />
                Cancel
              </Button>
            </>
          )}
        </div>
      }
    />
  );
}
