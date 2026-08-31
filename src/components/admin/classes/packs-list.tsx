"use client";

import { Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ClassesAdminTabs } from "@/components/admin/classes/classes-admin-tabs";
import type { ClassPackProduct } from "@/lib/db/schema/classes";

interface PacksListProps {
  packs: ClassPackProduct[];
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export default function PacksList({ packs }: PacksListProps) {
  return (
    <div className="space-y-6">
      <ClassesAdminTabs active="packs" />
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Class Packs</h1>
          <p className="text-sm text-ink-muted mt-1">
            Floating session-credit bundles a family buys for one child. Credits expire N
            months after purchase and can be used at any class session.
          </p>
        </div>
        <Button asChild>
          <a href="/admin/classes/packs/new">+ New pack</a>
        </Button>
      </header>

      {packs.length === 0 ? (
        <EmptyState
          title="No class packs yet"
          description="Create your first pack to let families buy session credits."
          icon={<Layers className="h-10 w-10" />}
        >
          <Button asChild>
            <a href="/admin/classes/packs/new">Create first pack</a>
          </Button>
        </EmptyState>
      ) : (
        <div className="rounded-lg border border-border bg-cream-2 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-cream border-b border-border">
              <tr className="text-left">
                <th className="px-4 py-2 font-medium text-ink-muted">Name</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Sessions</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Price</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Expires</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {packs.map((pack) => (
                <tr key={pack.id} className="border-t border-border hover:bg-cream/60">
                  <td className="px-4 py-3 font-medium text-ink">{pack.name}</td>
                  <td className="px-4 py-3 text-ink-muted">{pack.sessionCount}</td>
                  <td className="px-4 py-3 text-ink-muted">{formatCents(pack.priceCents)}</td>
                  <td className="px-4 py-3 text-ink-muted">{pack.expiryMonths} mo</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={
                        pack.active
                          ? "bg-emerald-100 text-emerald-900 border-emerald-200"
                          : "bg-stone-100 text-stone-700 border-stone-200"
                      }
                    >
                      {pack.active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={`/admin/classes/packs/${pack.id}`}
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
