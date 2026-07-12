"use client";

/**
 * ActivityDetailPanel — Roster view for a single VenueTodaySession.
 *
 * Shows:
 *  - Session header with capacity summary pills (booked / checked-in / waivers-out / open)
 *  - Confirmed-booking rows: avatar, name, 4 status chips (waiver / photo / paid / checked-in),
 *    Check-in button or "Here" badge, and SendLinkActions for incomplete rows
 *  - Open-slot rows: "Add walk-in" rows up to the open count (first 2 visible + count remainder)
 *
 * Roster data: fetches from /api/admin/check-in/event?kind=drop_in_session&id= (reuses the
 * existing Drawer endpoint). For non-drop-in sessions that endpoint returns rows too (game/
 * field_rental). Falls back to empty roster with open-slot rows when the session kind maps to
 * something the endpoint doesn't cover.
 *
 * WalkInFlow is rendered as an in-panel overlay when an open slot is clicked.
 */

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { SendLinkActions } from "@/components/admin/check-in/SendLinkActions";
import { AvatarUploader } from "@/components/admin/check-in/AvatarUploader";
import { WalkInFlow } from "./WalkInFlow";
import { useVisiblePoll } from "@/lib/hooks/use-visible-poll";
import { formatAgo } from "@/lib/venue/format-ago";
import type { VenueTodaySession } from "@/lib/venue/today-types";
import type { PersonCardTarget } from "@/components/admin/person/PersonCard";

// ─── Types matching the check-in event endpoint response ─────────────────────

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
  paid: boolean;
  status: "confirmed" | "pending_claim";
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  session: VenueTodaySession;
  locationId: string;
  timezone: string;
  onClose: () => void;
  onAction?: (sessionId: string) => void;
  /** Optional: called when a roster row name is clicked to open the Person 360 card. */
  onOpenPerson?: (target: PersonCardTarget) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(iso: string, timeZone: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  });
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/** Map VenueTodaySession.kind to the check-in event "kind" param. */
function sessionKindToEventKind(
  kind: VenueTodaySession["kind"],
): "drop_in_session" | "game" | "field_rental" | null {
  if (kind === "dropin" || kind === "class" || kind === "camp") return "drop_in_session";
  if (kind === "league" || kind === "tournament") return "game";
  if (kind === "rental") return "field_rental";
  return null; // hold — no roster
}

// ─── Chip helpers ─────────────────────────────────────────────────────────────

interface ChipProps {
  ok: boolean;
  okLabel: string;
  badLabel: string;
}

function StatusChip({ ok, okLabel, badLabel }: ChipProps) {
  if (ok) {
    return (
      <span className="text-[10.5px] font-bold rounded px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200">
        {okLabel}
      </span>
    );
  }
  return (
    <span className="text-[10.5px] font-bold rounded px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200">
      {badLabel}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ActivityDetailPanel({ session, locationId, timezone, onClose, onAction, onOpenPerson }: Props) {
  const [rows, setRows] = useState<RowData[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [photoOverrides, setPhotoOverrides] = useState<Record<string, string>>({});
  const [showWalkIn, setShowWalkIn] = useState(false);
  const [rowBusy, setRowBusy] = useState<Record<string, boolean>>({});
  // Holds cancelled locally but possibly still present in an in-flight poll
  // response. The poll filters these out so a stale response can't resurrect
  // a just-cancelled row; ids are dropped once the server stops returning them.
  const cancelledIdsRef = useRef<Set<string>>(new Set());
  // Rows checked in locally (optimistic flip) whose checkedInAt may still be
  // null in a stale in-flight poll response captured pre-checkin. The poll
  // overlays the optimistic timestamp so the button can't flicker back to
  // "Check in"; an entry is dropped once the server returns a real checkedInAt.
  const checkedInIdsRef = useRef<Map<string, string>>(new Map());

  const eventKind = sessionKindToEventKind(session.kind);

  // ── Fetch roster ───────────────────────────────────────────────────────────
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!eventKind) {
      setLoading(false);
      setRows([]);
    }
  }, [eventKind]);

  const load = async () => {
    if (!eventKind) return;
    try {
      const res = await fetch(
        `/api/admin/check-in/event?kind=${eventKind}&id=${session.id}`,
      );
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        if (aliveRef.current) setError(b.error ?? `Failed (${res.status})`);
        return;
      }
      const body = await res.json();
      if (aliveRef.current) {
        const serverRows: RowData[] = body.rows ?? [];
        // Drop rows we've cancelled locally (stale in-flight responses can
        // still contain them); once the server no longer returns an id, it
        // has caught up — stop tracking it.
        const serverIds = new Set(serverRows.map((r) => r.targetId));
        for (const id of cancelledIdsRef.current) {
          if (!serverIds.has(id)) cancelledIdsRef.current.delete(id);
        }
        // Overlay optimistic check-ins: a stale response captured pre-checkin
        // still has checkedInAt null — keep the optimistic timestamp until the
        // server catches up (returns non-null), then stop tracking the id.
        const nextRows = serverRows
          .filter((r) => !cancelledIdsRef.current.has(r.targetId))
          .map((r) => {
            const optimistic = checkedInIdsRef.current.get(r.targetId);
            if (optimistic === undefined) return r;
            if (r.checkedInAt !== null) {
              checkedInIdsRef.current.delete(r.targetId);
              return r;
            }
            return { ...r, checkedInAt: optimistic };
          });
        setRows(nextRows);
        setError(null);
      }
    } catch (err) {
      if (aliveRef.current) setError(err instanceof Error ? err.message : "Network error");
    } finally {
      if (aliveRef.current) setLoading(false);
    }
  };

  // Poll every 5 s (same cadence as existing Drawer), pausing while hidden.
  const { lastRunAt } = useVisiblePoll(load, 5_000);

  // Local 1s ticker so the "updated Ns ago" stamp advances between polls.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1_000);
    return () => clearInterval(t);
  }, []);

  // ── Check-in action ────────────────────────────────────────────────────────
  const checkIn = async (row: RowData) => {
    if (row.rowKind === "roster_entry" || rowBusy[row.targetId]) return;
    setRowBusy((p) => ({ ...p, [row.targetId]: true }));
    try {
      const res = await fetch("/api/admin/check-in/check-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: row.rowKind, targetId: row.targetId }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `Check-in failed (${res.status})`);
      }
      // Optimistic flip so the desk sees "Here" immediately, not at the next poll.
      // Also record it so a stale in-flight poll response (captured pre-checkin,
      // checkedInAt still null) can't revert the flip — see checkedInIdsRef.
      const optimisticAt = new Date().toISOString();
      checkedInIdsRef.current.set(row.targetId, optimisticAt);
      setRows((prev) =>
        prev?.map((r) =>
          r.targetId === row.targetId ? { ...r, checkedInAt: optimisticAt } : r,
        ) ?? prev,
      );
      onAction?.(session.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check-in failed — try again");
    } finally {
      setRowBusy((p) => ({ ...p, [row.targetId]: false }));
    }
  };

  // ── Held-row actions (resend waiver link / cancel hold) ─────────────────────
  const resendLink = async (row: RowData) => {
    setRowBusy((p) => ({ ...p, [row.targetId]: true }));
    try {
      const res = await fetch("/api/admin/check-in/send-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "drop_in_booking", targetId: row.targetId, channel: "sms" }),
      });
      if (!res.ok) throw new Error(`Failed (${res.status})`);
      toast.success(`Waiver link re-sent to ${row.name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not resend link");
    } finally {
      setRowBusy((p) => ({ ...p, [row.targetId]: false }));
    }
  };

  const cancelHold = async (row: RowData) => {
    setRowBusy((p) => ({ ...p, [row.targetId]: true }));
    try {
      const res = await fetch("/api/admin/venue/cancel-hold", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: row.targetId }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error ?? `Failed (${res.status})`);
      }
      toast.success(`Hold released — slot is open again`);
      cancelledIdsRef.current.add(row.targetId);
      setRows((prev) => prev?.filter((r) => r.targetId !== row.targetId) ?? prev);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not cancel hold");
    } finally {
      setRowBusy((p) => ({ ...p, [row.targetId]: false }));
    }
  };

  // ── Capacity math ──────────────────────────────────────────────────────────
  const booked = session.capacity !== null ? session.booked : (rows?.length ?? 0);
  const openSlots =
    session.capacity !== null ? Math.max(0, session.capacity - session.booked) : 0;
  const checkedInCount = rows?.filter((r) => r.checkedInAt !== null).length ?? 0;

  // Show first 2 open-slot rows + "N more" summary
  const OPEN_SLOT_PREVIEW = 2;

  const KIND_LABEL: Record<VenueTodaySession["kind"], string> = {
    dropin: "Drop-in",
    class: "Class",
    camp: "Camp",
    league: "League",
    tournament: "Tournament",
    rental: "Rental",
    hold: "Hold",
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-stone-900/50"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div
        className="fixed top-0 right-0 bottom-0 w-full max-w-2xl bg-[#fffdf8] shadow-xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="flex-none px-4 py-3 border-b border-[#e4ddcf]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[10.5px] uppercase tracking-widest font-bold text-teal-700 mb-0.5">
                {KIND_LABEL[session.kind]} · {session.spaceName}
              </div>
              <h3 className="text-lg font-semibold leading-tight text-[#1c1a17]">
                {session.title}
              </h3>
              <p className="text-xs text-[#4b463e] mt-0.5">
                {fmtTime(session.startsAt, timezone)}–{fmtTime(session.endsAt, timezone)}
              </p>
              {lastRunAt && (
                <span className="text-[10.5px] text-[#8a8175]">
                  updated {formatAgo(Math.floor((nowTick - lastRunAt) / 1000))} ago
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-[#8a8175] hover:text-[#1c1a17] text-2xl leading-none flex-shrink-0 mt-0.5"
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {/* Capacity pills */}
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            {session.capacity !== null && (
              <span className="text-[11.5px] font-bold rounded-full px-2.5 py-0.5 bg-[#f6f1e7] border border-[#e4ddcf] text-[#4b463e]">
                {booked} / {session.capacity} booked
              </span>
            )}
            {checkedInCount > 0 && (
              <span className="text-[11.5px] font-bold rounded-full px-2.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-800">
                {checkedInCount} checked in
              </span>
            )}
            {session.waiversOut > 0 && (
              <span className="text-[11.5px] font-bold rounded-full px-2.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-800">
                {session.waiversOut} waivers out
              </span>
            )}
            {openSlots > 0 && (
              <span className="text-[11.5px] font-bold rounded-full px-2.5 py-0.5 bg-[#f6f1e7] border border-[#e4ddcf] text-[#4b463e]">
                {openSlots} open
              </span>
            )}
          </div>
        </div>

        {/* ── Body ─────────────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {error && rows === null && (
            <div className="p-4">
              <ErrorBanner message={error} />
            </div>
          )}
          {error && rows !== null && (
            <div className="px-4 py-1.5 text-[11px] text-amber-800 bg-amber-50 border-b border-amber-200">
              Refresh failed — retrying…
            </div>
          )}
          {loading && !rows && (
            <div className="p-4">
              <LoadingSkeleton />
            </div>
          )}

          {/* Roster rows */}
          {rows?.map((row) => {
            const effectivePhotoUrl = photoOverrides[row.targetId] ?? row.photoUrl;
            const isHere = row.checkedInAt !== null;
            const isPaid = row.paid;
            const hasPhoto = effectivePhotoUrl !== null;
            const needsSendLink =
              !row.waiverSigned || !hasPhoto;

            return (
              <div
                key={row.targetId}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-[#efe9dc]"
              >
                {/* Avatar / photo upload */}
                <div className={row.status === "pending_claim" ? "opacity-60" : undefined}>
                  <AvatarUploader
                    kind={row.rowKind}
                    targetId={row.targetId}
                    photoUrl={effectivePhotoUrl}
                    name={row.name}
                    onUploaded={(url) =>
                      setPhotoOverrides((prev) => ({ ...prev, [row.targetId]: url }))
                    }
                  />
                </div>

                {/* Name + status chips */}
                <div className="flex-1 min-w-0">
                  {/* Name — clickable if we have a person target to open */}
                  {onOpenPerson && (row.familyMemberId || row.recipientUserId) ? (
                    <button
                      type="button"
                      onClick={() => {
                        const id = row.familyMemberId ?? row.recipientUserId!
                        const as: PersonCardTarget["as"] = row.familyMemberId
                          ? "family_member"
                          : "user"
                        onOpenPerson({ id, as })
                      }}
                      className="font-semibold text-[#1c1a17] truncate text-sm text-left hover:underline cursor-pointer max-w-full"
                    >
                      {row.name}
                    </button>
                  ) : (
                    <div className="font-semibold text-[#1c1a17] truncate text-sm">
                      {row.name}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1 mt-1">
                    <StatusChip
                      ok={row.waiverSigned}
                      okLabel="waiver ✓"
                      badLabel="waiver out"
                    />
                    <StatusChip
                      ok={hasPhoto}
                      okLabel="photo ✓"
                      badLabel="no photo"
                    />
                    {row.status === "pending_claim" ? (
                      <span className="text-[10.5px] font-bold rounded px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200">
                        ⏳ awaiting payment
                      </span>
                    ) : (
                      <StatusChip
                        ok={isPaid}
                        okLabel="paid ✓"
                        badLabel="unpaid"
                      />
                    )}
                    {isHere && (
                      <span className="text-[10.5px] font-bold rounded px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200">
                        checked in ✓
                      </span>
                    )}
                  </div>
                </div>

                {/* Send link (waiver/photo incomplete) */}
                {needsSendLink && (
                  <SendLinkActions kind={row.rowKind} targetId={row.targetId} />
                )}

                {/* Check-in / "Here" / held-row actions */}
                {row.status === "pending_claim" ? (
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => resendLink(row)}
                      disabled={rowBusy[row.targetId]}
                      className="text-xs px-2 py-1 rounded border border-[#e4ddcf] bg-[#f6f1e7] text-[#4b463e] font-semibold disabled:opacity-40"
                    >
                      Resend waiver link
                    </button>
                    <button
                      type="button"
                      onClick={() => cancelHold(row)}
                      disabled={rowBusy[row.targetId]}
                      className="text-xs px-2 py-1 rounded border border-rose-200 bg-rose-50 text-rose-700 font-semibold disabled:opacity-40"
                    >
                      Cancel hold
                    </button>
                  </div>
                ) : isHere ? (
                  <span className="text-xs font-black text-emerald-700 flex-shrink-0">
                    ✓ Here
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => checkIn(row)}
                    disabled={row.rowKind === "roster_entry" || rowBusy[row.targetId]}
                    className="text-xs px-3 py-1.5 rounded bg-[#1c1a17] text-[#fffdf8] flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed font-semibold"
                    title={
                      row.rowKind === "roster_entry"
                        ? "Game attendance not tracked in v1"
                        : undefined
                    }
                  >
                    {rowBusy[row.targetId] ? "…" : "Check in"}
                  </button>
                )}
              </div>
            );
          })}

          {/* Empty state */}
          {rows?.length === 0 && !loading && (
            <div className="text-sm text-[#8a8175] text-center py-8">
              No bookings yet.
            </div>
          )}

          {/* Open slots — dropin/class/camp only */}
          {session.kind !== "hold" && session.kind !== "rental" && openSlots > 0 && (
            <>
              {Array.from({ length: Math.min(openSlots, OPEN_SLOT_PREVIEW) }).map(
                (_, i) => (
                  <button
                    key={`open-${i}`}
                    type="button"
                    onClick={() => setShowWalkIn(true)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 border-t border-dashed border-[#e4ddcf] text-[#8a8175] hover:bg-[#fbf7ee] hover:text-[#4b463e] transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full border border-dashed border-[#e4ddcf] flex items-center justify-center text-lg font-bold flex-shrink-0">
                      +
                    </div>
                    <div className="flex-1 text-left text-sm font-medium">
                      Open slot — add walk-in
                    </div>
                    <span className="text-xs border border-[#e4ddcf] rounded-lg px-2.5 py-1 font-semibold bg-[#f6f1e7] text-[#4b463e]">
                      Add
                    </span>
                  </button>
                ),
              )}
              {openSlots > OPEN_SLOT_PREVIEW && (
                <div className="text-xs text-[#8a8175] text-center py-2 border-t border-[#e4ddcf]">
                  + {openSlots - OPEN_SLOT_PREVIEW} more open slot
                  {openSlots - OPEN_SLOT_PREVIEW !== 1 ? "s" : ""}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Walk-in Flow overlay ──────────────────────────────────────────── */}
        {showWalkIn && (
          <WalkInFlow
            session={session}
            locationId={locationId}
            onDone={() => {
              setShowWalkIn(false);
              // Trigger a refetch via onAction so the calendar can refresh counts
              onAction?.(session.id);
            }}
            onCancel={() => setShowWalkIn(false)}
          />
        )}
      </div>
    </div>
  );
}
