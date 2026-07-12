"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export interface RosterEntry {
  id: string;
  userId: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  status:
    | "confirmed"
    | "waitlisted"
    | "pending_payment"
    | "pending_claim"
    | "cancelled"
    | "no_show";
  paymentMethod: string;
  amountPaidCents: number;
  teamAssignment: string | null;
  checkedInAt: string | null;
  promotionExpiresAt: string | null;
}

interface AttendancePanelProps {
  sessionId: string;
  roster: RosterEntry[];
  teamColors: string[];
  onChange: () => void;
}

export function AttendancePanel({
  sessionId,
  roster,
  teamColors,
  onChange,
}: AttendancePanelProps) {
  const [busy, setBusy] = useState(false);

  const callAttendance = async (
    bookingId: string,
    action: "check_in" | "no_show" | "undo_check_in",
  ) => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/dropin/sessions/${sessionId}/attendance`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries: [{ bookingId, action }] }),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Update failed");
        return;
      }
      onChange();
    } finally {
      setBusy(false);
    }
  };

  const refundCancel = async (bookingId: string) => {
    if (!confirm("Refund and cancel this booking?")) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/dropin/bookings/${bookingId}/refund`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason: "admin_override" }),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Refund failed");
        return;
      }
      toast.success(json.refunded ? "Refunded" : "Cancelled");
      onChange();
    } finally {
      setBusy(false);
    }
  };

  if (roster.length === 0) {
    return (
      <p className="text-sm text-ink-muted">No confirmed attendees yet.</p>
    );
  }

  // If team-based, group by team color.
  const useTeams = teamColors.length > 0;
  const groups = useTeams
    ? teamColors.map((color) => ({
        color,
        rows: roster.filter((r) => r.teamAssignment === color),
      }))
    : [{ color: null as string | null, rows: roster }];

  return (
    <div
      className={`grid gap-4 ${
        useTeams && groups.length === 2 ? "md:grid-cols-2" : "grid-cols-1"
      }`}
    >
      {groups.map((g, idx) => (
        <div
          key={g.color ?? idx}
          className="rounded-lg border border-border bg-cream-2 overflow-hidden"
        >
          {g.color && (
            <div className="bg-cream px-4 py-2 border-b border-border font-semibold text-ink">
              {g.color} ({g.rows.length})
            </div>
          )}
          <ul className="divide-y divide-border">
            {g.rows.map((r) => (
              <li
                key={r.id}
                className="px-4 py-3 flex items-center justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-ink truncate">
                    {r.firstName} {r.lastName}
                  </div>
                  <div className="text-xs text-ink-muted truncate">
                    {r.email}
                  </div>
                  <div className="mt-1 flex items-center gap-1 flex-wrap text-[10px]">
                    <Badge variant="outline" className="text-[10px] font-normal">
                      {r.paymentMethod.replace(/_/g, " ")}
                    </Badge>
                    {r.amountPaidCents > 0 && (
                      <Badge variant="outline" className="text-[10px] font-normal">
                        ${(r.amountPaidCents / 100).toFixed(2)}
                      </Badge>
                    )}
                    {r.checkedInAt && (
                      <Badge className="bg-emerald-100 text-emerald-900 border-emerald-200 text-[10px] font-normal">
                        Checked in
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  {r.checkedInAt ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => callAttendance(r.id, "undo_check_in")}
                    >
                      Undo
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => callAttendance(r.id, "check_in")}
                    >
                      Check in
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => callAttendance(r.id, "no_show")}
                  >
                    No-show
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => refundCancel(r.id)}
                    className="text-rose-700"
                  >
                    Refund + cancel
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
