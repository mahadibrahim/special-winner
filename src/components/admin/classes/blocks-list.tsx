"use client";

import { CalendarRange } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ClassesAdminTabs } from "@/components/admin/classes/classes-admin-tabs";
import type { ClassBlock } from "@/lib/db/schema/classes";

interface BlocksListProps {
  blocks: ClassBlock[];
}

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function BlocksList({ blocks }: BlocksListProps) {
  return (
    <div className="space-y-6">
      <ClassesAdminTabs active="blocks" />
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Class Blocks</h1>
          <p className="text-sm text-ink-muted mt-1">
            Org-wide date windows a family buys into for one child's weekly class slot.
            Priced dynamically per template at purchase — no catalog price here.
          </p>
        </div>
        <Button asChild>
          <a href="/admin/classes/blocks/new">+ New block</a>
        </Button>
      </header>

      {blocks.length === 0 ? (
        <EmptyState
          title="No class blocks yet"
          description="Create your first block window to let families buy into a term."
          icon={<CalendarRange className="h-10 w-10" />}
        >
          <Button asChild>
            <a href="/admin/classes/blocks/new">Create first block</a>
          </Button>
        </EmptyState>
      ) : (
        <div className="rounded-lg border border-border bg-cream-2 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-cream border-b border-border">
              <tr className="text-left">
                <th className="px-4 py-2 font-medium text-ink-muted">Name</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Starts</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Ends</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Status</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((block) => (
                <tr key={block.id} className="border-t border-border hover:bg-cream/60">
                  <td className="px-4 py-3 font-medium text-ink">{block.name}</td>
                  <td className="px-4 py-3 text-ink-muted">{formatDate(block.startDate)}</td>
                  <td className="px-4 py-3 text-ink-muted">{formatDate(block.endDate)}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={
                        block.active
                          ? "bg-emerald-100 text-emerald-900 border-emerald-200"
                          : "bg-stone-100 text-stone-700 border-stone-200"
                      }
                    >
                      {block.active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={`/admin/classes/blocks/${block.id}`}
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
