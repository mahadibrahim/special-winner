"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
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
  status: string;
  hiredUserId: string | null;
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

  const [hiringId, setHiringId] = useState<string | null>(null);

  async function markHired(id: string) {
    setHiringId(id);
    try {
      const res = await fetch(`/api/admin/applications/${id}/hire`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setRows(
        (prev) =>
          prev?.map((r) =>
            r.id === id
              ? { ...r, status: "hired", hiredUserId: data.userId }
              : r,
          ) ?? prev,
      );
      toast.success(
        data.createdNewUser
          ? "Hired — coach account created and invite emailed."
          : "Hired — existing account linked and invite emailed.",
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not mark hired.",
      );
    } finally {
      setHiringId(null);
    }
  }

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
            <th className="py-2 pr-4">Hiring</th>
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
              <td className="py-2 pr-4">
                {a.status === "hired" ? (
                  <span className="rounded bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
                    Hired
                  </span>
                ) : (
                  <button
                    type="button"
                    disabled={hiringId === a.id}
                    onClick={() => markHired(a.id)}
                    className="rounded border border-border px-2 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
                  >
                    {hiringId === a.id ? "Hiring…" : "Mark hired"}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
