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
  const [openingPortal, setOpeningPortal] = useState(false);

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

  // Self-serve Stripe billing portal (POST /api/memberships/billing-portal,
  // returnPath "/dashboard/play" — this card renders on /dashboard/play, not
  // /dashboard). past_due gets a prominent button so a failing card is
  // actually fixable; active gets a low-key "Manage billing" link for
  // receipts/self-cancel. paused/incomplete get neither — nothing actionable
  // to click. The endpoint's 404 `no_billing_account` carries a real
  // `message` worth showing verbatim rather than a generic retry line, so
  // the body is read even on non-OK responses.
  async function openBillingPortal() {
    setOpeningPortal(true);
    try {
      const res = await fetch("/api/memberships/billing-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ returnPath: "/dashboard/play" }),
      });
      let body: { url?: unknown; message?: unknown } = {};
      try {
        body = await res.json();
      } catch {
        body = {};
      }
      if (!res.ok) {
        toast.error(
          typeof body.message === "string"
            ? body.message
            : "Could not open billing — please try again.",
        );
        return;
      }
      const url = typeof body.url === "string" ? body.url : null;
      if (!url) {
        toast.error("Could not open billing — please try again.");
        return;
      }
      window.location.assign(url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Network error — please try again.");
    } finally {
      setOpeningPortal(false);
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
          {membership.status === "past_due" && (
            <Button size="sm" onClick={() => void openBillingPortal()} disabled={openingPortal}>
              {openingPortal ? "Opening…" : "Update payment method"}
            </Button>
          )}
        </div>
      }
    >
      {membership.status === "active" && (
        <button
          type="button"
          onClick={() => void openBillingPortal()}
          disabled={openingPortal}
          className="mt-1.5 block text-left text-xs text-ink-muted hover:text-ink hover:underline disabled:opacity-60"
        >
          {openingPortal ? "Opening…" : "Manage billing →"}
        </button>
      )}
    </DashboardCard>
  );
}
