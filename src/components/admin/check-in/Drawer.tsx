"use client";

import { useEffect, useState } from "react";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { SendLinkActions } from "./SendLinkActions";
import { AvatarUploader } from "./AvatarUploader";

interface Props {
  kind: "drop_in_session" | "game" | "field_rental";
  id: string;
  onClose: () => void;
}

interface EventHeader {
  kind: string;
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  fieldNumber: number | null;
  venueName: string;
}

interface RowData {
  rowKind: "drop_in_booking" | "field_rental" | "roster_entry";
  targetId: string;
  name: string;
  subtitle: string;
  photoUrl: string | null;
  waiverSigned: boolean;
  checkedInAt: string | null;
  isMinor: boolean;
  familyMemberId: string | null;
  recipientUserId: string | null;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function Drawer({ kind, id, onClose }: Props) {
  const [data, setData] = useState<{ event: EventHeader; rows: RowData[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Track per-row photo URLs so avatar updates are reflected immediately
  const [photoOverrides, setPhotoOverrides] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;

    const load = async () => {
      try {
        const res = await fetch(`/api/admin/check-in/event?kind=${kind}&id=${id}`);
        if (!res.ok) {
          const b = await res.json().catch(() => ({}));
          if (alive) setError(b.error ?? `Failed (${res.status})`);
          return;
        }
        const body = await res.json();
        if (alive) setData(body);
      } catch (err) {
        if (alive) setError(err instanceof Error ? err.message : "Network error");
      } finally {
        if (alive) setLoading(false);
      }
    };

    load();
    const interval = setInterval(load, 5_000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [kind, id]);

  const checkIn = async (row: RowData) => {
    // roster_entry check-in needs a dedicated attendance row — out of scope for v1
    if (row.rowKind === "roster_entry") return;
    await fetch("/api/admin/check-in/check-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: row.rowKind, targetId: row.targetId }),
    });
    // The polling interval will refresh state shortly; no need to manually update.
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-stone-900/50"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="fixed top-0 right-0 bottom-0 w-full max-w-2xl bg-white shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between p-4 border-b gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold leading-tight">
              {data?.event?.title ?? "Loading…"}
            </h3>
            {data?.event && (
              <p className="text-xs text-stone-500 mt-0.5">
                {fmtTime(data.event.startsAt)}–{fmtTime(data.event.endsAt)}
                {data.event.fieldNumber != null ? ` · Field ${data.event.fieldNumber}` : ""}
                {" · "}{data.event.venueName}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-500 hover:text-stone-900 text-2xl leading-none flex-shrink-0 mt-0.5"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {error && <ErrorBanner message={error} />}
          {loading && !data && <LoadingSkeleton />}

          {data?.rows.map((row) => {
            const effectivePhotoUrl = photoOverrides[row.targetId] ?? row.photoUrl;
            const needsSendLink = !row.waiverSigned || !effectivePhotoUrl;

            return (
              <div
                key={row.targetId}
                className="flex items-center gap-3 p-3 border rounded-lg"
              >
                <AvatarUploader
                  kind={row.rowKind}
                  targetId={row.targetId}
                  photoUrl={effectivePhotoUrl}
                  name={row.name}
                  onUploaded={(url) =>
                    setPhotoOverrides((prev) => ({ ...prev, [row.targetId]: url }))
                  }
                />

                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{row.name}</div>
                  <div className="text-xs text-stone-500 truncate">{row.subtitle}</div>
                  <div className="text-xs mt-1">
                    {row.waiverSigned ? (
                      <span className="text-emerald-700">waiver signed</span>
                    ) : (
                      <span className="text-amber-700">waiver outstanding</span>
                    )}
                  </div>
                </div>

                {needsSendLink && (
                  <SendLinkActions kind={row.rowKind} targetId={row.targetId} />
                )}

                {row.checkedInAt ? (
                  <span className="text-xs px-2 py-1 rounded bg-emerald-100 text-emerald-800 font-medium flex-shrink-0">
                    Here
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => checkIn(row)}
                    disabled={row.rowKind === "roster_entry"}
                    className="text-xs px-3 py-1 rounded bg-stone-900 text-white flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                    title={row.rowKind === "roster_entry" ? "Game attendance not tracked in v1" : undefined}
                  >
                    Check in
                  </button>
                )}
              </div>
            );
          })}

          {data?.rows.length === 0 && (
            <div className="text-sm text-stone-500 text-center py-8">
              No expected attendees yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
