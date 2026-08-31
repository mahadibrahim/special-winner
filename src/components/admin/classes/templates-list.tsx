"use client";

import { GraduationCap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ClassesAdminTabs } from "@/components/admin/classes/classes-admin-tabs";
import type { ClassSlotTemplate } from "@/lib/db/schema/classes";

type TemplateRow = ClassSlotTemplate & { enrolledCount: number };

interface TemplatesListProps {
  templates: TemplateRow[];
}

const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatDayTime(weekday: number, startTime: string): string {
  const day = WEEKDAY_NAMES[weekday] ?? `Day ${weekday}`;
  const [hourStr, minuteStr] = startTime.slice(0, 5).split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return `${day} ${startTime.slice(0, 5)}`;
  const period = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${day} ${displayHour}:${String(minute).padStart(2, "0")} ${period}`;
}

function formatAgeRange(minAge: number | null, maxAge: number | null): string {
  if (minAge == null && maxAge == null) return "All ages";
  if (minAge != null && maxAge != null) return `${minAge}–${maxAge}`;
  if (minAge != null) return `${minAge}+`;
  return `Up to ${maxAge}`;
}

export default function TemplatesList({ templates }: TemplatesListProps) {
  return (
    <div className="space-y-6">
      <ClassesAdminTabs active="templates" />
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Classes</h1>
          <p className="text-sm text-ink-muted mt-1">
            Recurring weekly class slots. Enrolled children are auto-booked into each
            materialized session while their monthly allotment lasts.
          </p>
        </div>
        <Button asChild>
          <a href="/admin/classes/new">+ New class</a>
        </Button>
      </header>

      {templates.length === 0 ? (
        <EmptyState
          title="No classes yet"
          description="Create your first recurring class slot to start enrolling children."
          icon={<GraduationCap className="h-10 w-10" />}
        >
          <Button asChild>
            <a href="/admin/classes/new">Create first class</a>
          </Button>
        </EmptyState>
      ) : (
        <div className="rounded-lg border border-border bg-cream-2 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-cream border-b border-border">
              <tr className="text-left">
                <th className="px-4 py-2 font-medium text-ink-muted">Name</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Day / time</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Ages</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Capacity</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Enrolled</th>
                <th className="px-4 py-2 font-medium text-ink-muted">Status</th>
                <th className="px-4 py-2 font-medium text-ink-muted"></th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {templates.map((template) => (
                <tr key={template.id} className="border-t border-border hover:bg-cream/60">
                  <td className="px-4 py-3 font-medium text-ink">{template.name}</td>
                  <td className="px-4 py-3 text-ink-muted">
                    {formatDayTime(template.weekday, template.startTime)}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">
                    {formatAgeRange(template.minAge, template.maxAge)}
                  </td>
                  <td className="px-4 py-3 text-ink-muted">{template.capacity}</td>
                  <td className="px-4 py-3 text-ink-muted">{template.enrolledCount}</td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="outline"
                      className={
                        template.active
                          ? "bg-emerald-100 text-emerald-900 border-emerald-200"
                          : "bg-stone-100 text-stone-700 border-stone-200"
                      }
                    >
                      {template.active ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {template.sessionRateCents == null && template.memberRateCents == null && (
                      <Badge
                        variant="outline"
                        className="bg-warning/10 text-warning border-warning/30 whitespace-nowrap"
                      >
                        No rates set — paid bookings blocked
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={`/admin/classes/${template.id}`}
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
