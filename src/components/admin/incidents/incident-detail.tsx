"use client";

import { useEffect, useState } from "react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

interface IncidentDetailData {
  id: string;
  incidentType: string;
  status: "open" | "closed";
  occurredAt: string;
  venueId: string;
  venueName: string | null;
  gameId: string | null;
  subjectType: "participant" | "bystander" | "staff" | "other";
  subjectFreeTextName: string | null;
  subjectFirstName: string | null;
  subjectLastName: string | null;
  peopleInvolved: string;
  firstResponderName: string;
  immediateCareGiven: string;
  emergencyServicesCalled: boolean;
  emergencyServicesCallTime: string | null;
  suspectedConcussion: boolean;
  removedFromPlay: boolean | null;
  parentNotifiedOnsite: boolean;
  concussionClearanceStatus: "pending" | "received" | null;
  createdAt: string;
}

function incidentTypeLabel(type: string): string {
  return type
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function yesNo(v: boolean | null): string {
  if (v === null) return "—";
  return v ? "Yes" : "No";
}

export function IncidentDetail({ incidentId }: { incidentId: string }) {
  useHydrationBeacon();

  const [data, setData] = useState<IncidentDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/admin/incidents/${incidentId}`);
        if (!res.ok) throw new Error(`Failed to load incident (${res.status})`);
        const json = await res.json();
        if (!cancelled) setData(json.incident);
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? "Unexpected error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [incidentId]);

  if (error) return <ErrorBanner message={error} />;
  if (!data) return <LoadingSkeleton rows={6} />;

  const subject =
    data.subjectType === "participant"
      ? [data.subjectFirstName, data.subjectLastName].filter(Boolean).join(" ") || "Participant"
      : (data.subjectFreeTextName ?? "Unknown");

  const rows: Array<[string, string]> = [
    ["Type", incidentTypeLabel(data.incidentType)],
    ["Status", data.status],
    ["Occurred at", new Date(data.occurredAt).toLocaleString()],
    ["Venue", data.venueName ?? "—"],
    ["Subject", `${subject} (${data.subjectType})`],
    ["People involved", data.peopleInvolved],
    ["First responder", data.firstResponderName],
    ["Immediate care given", data.immediateCareGiven],
    ["Emergency services called", yesNo(data.emergencyServicesCalled)],
    [
      "Emergency services call time",
      data.emergencyServicesCallTime ? new Date(data.emergencyServicesCallTime).toLocaleString() : "—",
    ],
    ["Suspected concussion", yesNo(data.suspectedConcussion)],
    ["Removed from play", yesNo(data.removedFromPlay)],
    ["Concussion clearance", data.concussionClearanceStatus ?? "—"],
    ["Parent notified on-site", yesNo(data.parentNotifiedOnsite)],
    ["Filed", new Date(data.createdAt).toLocaleString()],
  ];

  return (
    <dl className="divide-y divide-ink/10">
      {rows.map(([label, value]) => (
        <div key={label} className="py-3 grid grid-cols-3 gap-4">
          <dt className="text-ink-muted text-sm">{label}</dt>
          <dd className="col-span-2 text-ink whitespace-pre-wrap">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
