"use client";

import { useState, useRef } from "react";
import { GripVertical, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "sonner";
import type { MembershipTier } from "@/lib/db/schema/memberships";

interface TiersListProps {
  tiers: MembershipTier[];
}

function formatCents(cents: number | null | undefined): string {
  if (cents == null) return "—";
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function TiersList({ tiers: initialTiers }: TiersListProps) {
  const [rows, setRows] = useState<MembershipTier[]>(initialTiers);
  const dragIndex = useRef<number | null>(null);

  function handleDragStart(index: number) {
    dragIndex.current = index;
  }

  function handleDragOver(e: React.DragEvent<HTMLTableRowElement>) {
    e.preventDefault();
  }

  async function handleDrop(e: React.DragEvent<HTMLTableRowElement>, dropIndex: number) {
    e.preventDefault();
    const from = dragIndex.current;
    if (from === null || from === dropIndex) return;

    const reordered = [...rows];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(dropIndex, 0, moved);
    dragIndex.current = null;

    const previous = rows;
    setRows(reordered);

    try {
      const res = await fetch("/api/admin/memberships/tiers/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: reordered.map((t) => t.id) }),
      });
      if (!res.ok) {
        setRows(previous);
        toast.error("Failed to save order — changes reverted");
      }
    } catch {
      setRows(previous);
      toast.error("Failed to save order — changes reverted");
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Membership Tiers</h1>
          <p className="text-sm text-ink-muted mt-1">
            Configure the membership tiers available at this organization. Drag rows to reorder.
          </p>
        </div>
        <Button asChild>
          <a href="/admin/memberships/new">+ New tier</a>
        </Button>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          title="No membership tiers yet"
          description="Create your first tier to start offering memberships."
          icon={<Layers className="h-10 w-10" />}
        >
          <Button asChild>
            <a href="/admin/memberships/new">Create first tier</a>
          </Button>
        </EmptyState>
      ) : (
        <div className="rounded-lg border border-border bg-cream-2 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-cream border-b border-border">
              <tr className="text-left">
                <th className="px-4 py-2 w-8"></th>
                <th className="px-4 py-2 font-medium text-ink-muted">Name</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Monthly</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Annual</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Technical</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((tier, index) => (
                <tr
                  key={tier.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, index)}
                  className="border-t border-border hover:bg-cream/60 cursor-default"
                >
                  <td className="px-4 py-3 text-ink-muted/50">
                    <GripVertical className="h-4 w-4 cursor-grab active:cursor-grabbing" />
                  </td>
                  <td className="px-4 py-3 font-medium text-ink">{tier.name}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    {formatCents(tier.monthlyPriceCents)}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {formatCents(tier.annualPriceCents)}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {tier.technicalMonthlyCents != null
                      ? `+${formatCents(tier.technicalMonthlyCents)}/mo`
                      : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={
                        tier.isActive
                          ? "bg-emerald-100 text-emerald-900 border-emerald-200"
                          : "bg-stone-100 text-stone-700 border-stone-200"
                      }
                    >
                      {tier.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={`/admin/memberships/${tier.id}`}
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
    </div>
  );
}
