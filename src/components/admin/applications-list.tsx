"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";

interface ApplicationRow {
  id: string;
  role: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  preferredLocation: string | null;
  certifications: string | null;
  experience: string;
  availability: string[];
  resumeKey: string | null;
  source: string | null;
  notionPageId: string | null;
  notionSyncedAt: string | null;
  createdAt: string;
}

export default function ApplicationsList() {
  const [rows, setRows] = useState<ApplicationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/applications")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setRows((await r.json()).applications);
      })
      .catch(() => setError("Could not load applications."));
  }, []);

  if (error) return <ErrorBanner message={error} />;
  if (!rows) return <LoadingSkeleton />;
  if (rows.length === 0)
    return (
      <EmptyState
        title="No applications yet"
        description="Applications from /careers will appear here and in the Notion Hiring Pipeline."
      />
    );

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b border-border">
            <th className="py-2 pr-4">Applied</th>
            <th className="py-2 pr-4">Name</th>
            <th className="py-2 pr-4">Role</th>
            <th className="py-2 pr-4">Contact</th>
            <th className="py-2 pr-4">Facility</th>
            <th className="py-2 pr-4">Resume</th>
            <th className="py-2 pr-4">Notion</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id} className="border-b border-border/50 align-top">
              <td className="py-2 pr-4 whitespace-nowrap">
                {new Date(a.createdAt).toLocaleDateString()}
              </td>
              <td className="py-2 pr-4 font-medium">
                {a.firstName} {a.lastName}
              </td>
              <td className="py-2 pr-4 capitalize">{a.role}</td>
              <td className="py-2 pr-4">
                {a.email}
                {a.phone ? ` · ${a.phone}` : ""}
              </td>
              <td className="py-2 pr-4 capitalize">{a.preferredLocation ?? "—"}</td>
              <td className="py-2 pr-4">
                {a.resumeKey ? (
                  <a
                    className="underline"
                    href={`/api/admin/applications/${a.id}/resume`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    PDF
                  </a>
                ) : (
                  "—"
                )}
              </td>
              <td className="py-2 pr-4">{a.notionSyncedAt ? "Synced" : "Pending"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
