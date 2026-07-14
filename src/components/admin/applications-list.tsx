"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
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
  photoKey: string | null;
  motivationVideoKey: string | null;
  demoVideoKey: string | null;
  source: string | null;
  notionPageId: string | null;
  notionSyncedAt: string | null;
  status: string;
  hiredUserId: string | null;
  createdAt: string;
}

const ROLE_FILTERS = ["all", "referee", "coach", "staff", "host"] as const;

/** Video element that falls back to an "open in new tab" link on error —
 * covers link-mode applications where the stored value is a YouTube/Loom
 * URL that the `/media/:kind` redirect passes through but a bare
 * `<video>` tag can't play inline. */
function MediaVideo({ src, label }: { src: string; label: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <a className="underline" href={src} target="_blank" rel="noreferrer">
        {label}
      </a>
    );
  }
  return (
    <video
      controls
      preload="none"
      src={src}
      className="h-20 w-32 rounded bg-black object-cover"
      onError={() => setFailed(true)}
    />
  );
}

/** Same fallback idea as MediaVideo, for the applicant photo — covers
 * link-mode applications where the stored value is a share link that
 * doesn't resolve directly to image bytes. */
function MediaPhoto({
  src,
  alt,
}: {
  src: string;
  alt: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <a className="underline" href={src} target="_blank" rel="noreferrer">
        Photo
      </a>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className="h-24 w-24 rounded-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}

export default function ApplicationsList() {
  useHydrationBeacon();

  const [rows, setRows] = useState<ApplicationRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] =
    useState<(typeof ROLE_FILTERS)[number]>("all");

  useEffect(() => {
    fetch("/api/admin/applications")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        setRows((await r.json()).applications);
      })
      .catch(() => setError("Could not load applications."));
  }, []);

  const [hiringId, setHiringId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);

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

  async function approveAsHost(id: string) {
    setApprovingId(id);
    try {
      const res = await fetch(`/api/admin/applications/${id}/approve-host`, {
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
          ? "Approved — host account created and welcome email sent."
          : "Approved — existing account linked and welcome email sent.",
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not approve host.",
      );
    } finally {
      setApprovingId(null);
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

  const visibleRows =
    roleFilter === "all" ? rows : rows.filter((r) => r.role === roleFilter);

  return (
    <div>
      <div className="mb-3 flex items-center gap-2 text-sm">
        <label htmlFor="role-filter" className="font-medium">
          Role
        </label>
        <select
          id="role-filter"
          value={roleFilter}
          onChange={(e) =>
            setRoleFilter(e.target.value as (typeof ROLE_FILTERS)[number])
          }
          className="rounded border border-border px-2 py-1"
        >
          {ROLE_FILTERS.map((r) => (
            <option key={r} value={r} className="capitalize">
              {r === "all" ? "All roles" : r}
            </option>
          ))}
        </select>
      </div>
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
              <th className="py-2 pr-4">Media</th>
              <th className="py-2 pr-4">Notion</th>
              <th className="py-2 pr-4">Hiring</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((a) => (
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
                <td className="py-2 pr-4">
                  {a.role === "host" ? (
                    <div className="flex flex-col gap-2">
                      {a.photoKey ? (
                        <MediaPhoto
                          src={`/api/admin/applications/${a.id}/media/photo`}
                          alt={`${a.firstName} ${a.lastName}`}
                        />
                      ) : null}
                      {a.motivationVideoKey ? (
                        <MediaVideo
                          src={`/api/admin/applications/${a.id}/media/motivation`}
                          label="Motivation video"
                        />
                      ) : null}
                      {a.demoVideoKey ? (
                        <MediaVideo
                          src={`/api/admin/applications/${a.id}/media/demo`}
                          label="Demo video"
                        />
                      ) : null}
                      {!a.photoKey && !a.motivationVideoKey && !a.demoVideoKey
                        ? "—"
                        : null}
                    </div>
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
                  ) : a.role === "host" ? (
                    <button
                      type="button"
                      disabled={approvingId === a.id}
                      onClick={() => approveAsHost(a.id)}
                      className="rounded border border-border px-2 py-1 text-xs font-medium hover:bg-gray-50 disabled:opacity-50"
                    >
                      {approvingId === a.id ? "Approving…" : "Approve as host"}
                    </button>
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
    </div>
  );
}
