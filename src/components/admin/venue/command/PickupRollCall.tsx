"use client";

/**
 * PickupRollCall — rapid roll-call panel for an open pickup session.
 *
 * Rendered as a right-side panel (matching the ActivityDetailPanel chrome)
 * with two sections:
 *
 *  1. Add row — autofocused First + Last name fields + Phone + Add button.
 *     Enter submits. On success: toast, clear inputs, refocus first-name field.
 *     On error: inline ErrorBanner, inputs retained.
 *     If linkSent === false: non-blocking toast warning "added — link not sent".
 *
 *  2. Attendance list — polls /api/admin/check-in/event?kind=drop_in_session&id=<sessionId>
 *     every 5 s (same cadence as ActivityDetailPanel). Renders StatusChip rows for
 *     waiver / paid / checked-in. Team-color / teamAssignment column is intentionally
 *     hidden (pickup sessions don't use team assignment). Each row has
 *     data-pickup-attendee for e2e targeting.
 *
 * Note on reuse strategy: ActivityDetailPanel takes a full VenueTodaySession
 * object (not just sessionId) and includes WalkInFlow, open-slot rows, and
 * check-in controls that are not relevant here. Rather than forking that
 * component, we inline the roster fetch/poll pattern and StatusChip shape,
 * which keeps PickupRollCall self-contained with no coupling to the venue
 * session type system.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { UserPlus, X } from "lucide-react";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { usePickupAdd } from "@/lib/hooks/use-pickup-add";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { useVisiblePoll } from "@/lib/hooks/use-visible-poll";
import { formatAgo } from "@/lib/venue/format-ago";

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
  status: "confirmed" | "pending_payment" | "pending_claim";
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  sessionId: string;
  sessionTitle: string;
  onClose: () => void;
}

// ─── Chip helpers (mirrors ActivityDetailPanel StatusChip) ───────────────────

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

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PickupRollCall({ sessionId, sessionTitle, onClose }: Props) {
  useHydrationBeacon();

  const { add, isAdding } = usePickupAdd(sessionId);

  // ── Form state ─────────────────────────────────────────────────────────────
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const firstNameRef = useRef<HTMLInputElement>(null);

  // ── Roster state ───────────────────────────────────────────────────────────
  const [rows, setRows] = useState<RowData[] | null>(null);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [rosterError, setRosterError] = useState<string | null>(null);

  // ── Roster fetch + visibility-aware poll ───────────────────────────────────
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const load = async () => {
    try {
      const res = await fetch(
        `/api/admin/check-in/event?kind=drop_in_session&id=${sessionId}`,
      );
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        if (aliveRef.current) setRosterError((b as { error?: string }).error ?? `Failed (${res.status})`);
        return;
      }
      const body = await res.json();
      if (aliveRef.current) {
        setRows((body as { rows?: RowData[] }).rows ?? []);
        setRosterError(null);
      }
    } catch (err) {
      if (aliveRef.current) setRosterError(err instanceof Error ? err.message : "Network error");
    } finally {
      if (aliveRef.current) setRosterLoading(false);
    }
  };

  const { lastRunAt } = useVisiblePoll(load, 5_000);

  // Local 1s ticker so the "updated Ns ago" stamp advances between polls.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1_000);
    return () => clearInterval(t);
  }, []);

  // ── Submit handler ─────────────────────────────────────────────────────────
  const handleAdd = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setAddError(null);

      const result = await add({ firstName, lastName, phone });

      if (!result.ok) {
        setAddError(result.error);
        return;
      }

      // Success: notify + clear + refocus
      if (result.linkSent) {
        toast.success(`${result.personName} added — link sent`);
      } else {
        toast.success(`${result.personName} added`, {
          description: "SMS link could not be sent — ask them to complete at the kiosk.",
        });
      }

      setFirstName("");
      setLastName("");
      setPhone("");
      setAddError(null);
      // Refocus name field for the next person
      setTimeout(() => firstNameRef.current?.focus(), 0);
    },
    [add, firstName, lastName, phone],
  );

  // ── Render ─────────────────────────────────────────────────────────────────
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
                Pickup · Roll Call
              </div>
              <h3 className="text-lg font-semibold leading-tight text-[#1c1a17]">
                {sessionTitle}
              </h3>
              <p className="text-xs text-[#4b463e] mt-0.5">
                Add walk-ups as they arrive — link texted automatically
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-[#8a8175] hover:text-[#1c1a17] flex-shrink-0 mt-0.5 p-1 rounded"
              aria-label="Close"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* ── Add row ──────────────────────────────────────────────────────── */}
        <div className="flex-none px-4 py-3 border-b border-[#e4ddcf] bg-[#fbf7ee]">
          <form onSubmit={handleAdd}>
            <div className="flex gap-2 items-end">
              {/* First name */}
              <div className="flex-1 min-w-0">
                <label
                  htmlFor="pickup-first-name"
                  className="block text-[11px] font-bold text-[#4b463e] mb-1"
                >
                  First name
                </label>
                <input
                  id="pickup-first-name"
                  ref={firstNameRef}
                  type="text"
                  autoFocus
                  autoComplete="off"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First"
                  required
                  disabled={isAdding}
                  className="w-full border border-[#e4ddcf] rounded-lg px-3 py-2 bg-[#fffdf8] text-[13.5px] text-[#1c1a17] focus:outline-none focus:border-[#1c1a17] focus:ring-1 focus:ring-[#1c1a17]/20 disabled:opacity-60"
                />
              </div>

              {/* Last name */}
              <div className="flex-1 min-w-0">
                <label
                  htmlFor="pickup-last-name"
                  className="block text-[11px] font-bold text-[#4b463e] mb-1"
                >
                  Last name
                </label>
                <input
                  id="pickup-last-name"
                  type="text"
                  autoComplete="off"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last"
                  required
                  disabled={isAdding}
                  className="w-full border border-[#e4ddcf] rounded-lg px-3 py-2 bg-[#fffdf8] text-[13.5px] text-[#1c1a17] focus:outline-none focus:border-[#1c1a17] focus:ring-1 focus:ring-[#1c1a17]/20 disabled:opacity-60"
                />
              </div>

              {/* Phone */}
              <div className="flex-1 min-w-0">
                <label
                  htmlFor="pickup-mobile"
                  className="block text-[11px] font-bold text-[#4b463e] mb-1"
                >
                  Mobile
                </label>
                <input
                  id="pickup-mobile"
                  type="tel"
                  autoComplete="off"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(614) 555-0142"
                  required
                  disabled={isAdding}
                  className="w-full border border-[#e4ddcf] rounded-lg px-3 py-2 bg-[#fffdf8] text-[13.5px] text-[#1c1a17] focus:outline-none focus:border-[#1c1a17] focus:ring-1 focus:ring-[#1c1a17]/20 disabled:opacity-60"
                />
              </div>

              {/* Add button */}
              <div className="flex-none">
                <div className="mb-1 h-[15px]" aria-hidden="true" />
                <button
                  type="submit"
                  disabled={isAdding || !firstName.trim() || !lastName.trim() || !phone.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#1c1a17] text-[#fffdf8] rounded-lg text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#2e2b26] transition-colors"
                >
                  <UserPlus className="size-4" />
                  {isAdding ? "Adding…" : "Add"}
                </button>
              </div>
            </div>

            {/* Inline error */}
            {addError && (
              <div className="mt-2">
                <ErrorBanner message={addError} onDismiss={() => setAddError(null)} />
              </div>
            )}
          </form>
        </div>

        {/* ── Attendance list ───────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          {/* Roster section header */}
          <div className="px-4 py-2 border-b border-[#efe9dc] bg-[#f6f1e7] flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-widest text-[#4b463e]">
              Attendance
              {rows !== null && (
                <span className="ml-1.5 text-[#8a8175]">({rows.length})</span>
              )}
            </span>
            {lastRunAt && (
              <span className="text-[10.5px] font-normal normal-case tracking-normal text-[#8a8175]">
                updated {formatAgo(Math.floor((nowTick - lastRunAt) / 1000))} ago
              </span>
            )}
          </div>

          {/* Roster error */}
          {rosterError && (
            <div className="p-4">
              <ErrorBanner message={rosterError} />
            </div>
          )}

          {/* Loading skeleton */}
          {rosterLoading && !rows && (
            <div className="p-4">
              <LoadingSkeleton rows={4} />
            </div>
          )}

          {/* Empty state */}
          {!rosterLoading && rows !== null && rows.length === 0 && (
            <EmptyState
              title="No one added yet"
              description="Type a name above to start the roll call."
              className="py-16"
            />
          )}

          {/* Roster rows */}
          {rows?.map((row) => {
            const isCheckedIn = row.checkedInAt !== null;
            const isPaid = row.paid;

            return (
              <div
                key={row.targetId}
                data-pickup-attendee={row.targetId}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-[#efe9dc]"
              >
                {/* Avatar circle */}
                <div
                  className="w-9 h-9 rounded-full bg-[#e4ddcf] flex items-center justify-center text-xs font-black text-[#4b463e] flex-shrink-0 select-none"
                  aria-hidden="true"
                >
                  {initials(row.name)}
                </div>

                {/* Name + status chips */}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[#1c1a17] truncate text-sm">
                    {row.name}
                  </div>
                  {/* team-color / teamAssignment intentionally omitted for pickup */}
                  <div className="flex flex-wrap gap-1 mt-1">
                    <StatusChip
                      ok={row.waiverSigned}
                      okLabel="waiver ✓"
                      badLabel="waiver out"
                    />
                    {row.status === "pending_payment" ? (
                      <span className="text-[10.5px] font-bold rounded px-1.5 py-0.5 bg-amber-50 text-amber-700 border border-amber-200">
                        ⏳ awaiting payment
                      </span>
                    ) : row.status === "pending_claim" ? (
                      <span className="text-[10.5px] font-bold rounded px-1.5 py-0.5 bg-[#f6f1e7] text-[#8a8175] border border-[#e4ddcf]">
                        awaiting claim
                      </span>
                    ) : (
                      <StatusChip
                        ok={isPaid}
                        okLabel="paid ✓"
                        badLabel="unpaid"
                      />
                    )}
                    {isCheckedIn && (
                      <span className="text-[10.5px] font-bold rounded px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200">
                        checked in ✓
                      </span>
                    )}
                  </div>
                </div>

                {/* Checked-in badge */}
                {isCheckedIn ? (
                  <span className="text-xs font-black text-emerald-700 flex-shrink-0">
                    ✓ Here
                  </span>
                ) : (
                  <span className="text-xs font-medium text-[#8a8175] flex-shrink-0">
                    pending
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
