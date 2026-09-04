"use client";

import { useEffect, useState } from "react";
import { Users, CalendarClock } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";

interface Enrollment {
  enrollmentId: string;
  familyMemberId: string;
  childName: string;
  age: number | null;
  kitSize: string | null;
  startedAt: string;
}

interface UpcomingSession {
  sessionId: string;
  startsAt: string;
  bookedCount: number;
  capacity: number;
  trialCount: number;
}

interface RosterResponse {
  enrollments: Enrollment[];
  upcomingSessions: UpcomingSession[];
}

interface TemplateRosterProps {
  templateId: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function TemplateRoster({ templateId }: TemplateRosterProps) {
  const [data, setData] = useState<RosterResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/classes/templates/${templateId}/roster`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error("Failed to load roster");
        }
        return (await res.json()) as RosterResponse;
      })
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load the roster. Try refreshing.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  if (loading) {
    return (
      <div className="max-w-2xl space-y-6">
        <LoadingSkeleton rows={4} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl">
        <ErrorBanner message={error} />
      </div>
    );
  }

  const enrollments = data?.enrollments ?? [];
  const upcomingSessions = data?.upcomingSessions ?? [];

  return (
    <div className="max-w-2xl space-y-8">
      <section className="space-y-3">
        <h2 className="font-semibold text-ink text-lg">Enrolled children</h2>
        {enrollments.length === 0 ? (
          <EmptyState
            title="No active enrollments"
            description="Children enrolled in this class will show up here."
            icon={<Users className="h-8 w-8" />}
          />
        ) : (
          <div className="rounded-lg border border-border bg-cream-2 overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-cream border-b border-border">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium text-ink-muted">Child</th>
                  <th className="px-4 py-2 font-medium text-ink-muted">Age</th>
                  <th className="px-4 py-2 font-medium text-ink-muted">Jersey</th>
                  <th className="px-4 py-2 font-medium text-ink-muted">Enrolled since</th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map((e) => (
                  <tr key={e.enrollmentId} className="border-t border-border">
                    <td className="px-4 py-3 font-medium text-ink">{e.childName}</td>
                    <td className="px-4 py-3 text-ink-muted">{e.age ?? "—"}</td>
                    <td className="px-4 py-3 text-ink-muted">{e.kitSize ?? "—"}</td>
                    <td className="px-4 py-3 text-ink-muted">{formatDate(e.startedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-ink text-lg">Upcoming sessions</h2>
        {upcomingSessions.length === 0 ? (
          <EmptyState
            title="No upcoming sessions"
            description="Sessions materialize from this class's weekly schedule."
            icon={<CalendarClock className="h-8 w-8" />}
          />
        ) : (
          <div className="rounded-lg border border-border bg-cream-2 overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-cream border-b border-border">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium text-ink-muted">When</th>
                  <th className="px-4 py-2 font-medium text-ink-muted">Booked / capacity</th>
                  <th className="px-4 py-2 font-medium text-ink-muted">Trials</th>
                </tr>
              </thead>
              <tbody>
                {upcomingSessions.map((s) => (
                  <tr key={s.sessionId} className="border-t border-border">
                    <td className="px-4 py-3 text-ink">{formatDateTime(s.startsAt)}</td>
                    <td className="px-4 py-3 text-ink-muted">
                      {s.bookedCount} / {s.capacity}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{s.trialCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
