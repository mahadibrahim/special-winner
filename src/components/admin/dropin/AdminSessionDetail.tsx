"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorBanner } from "@/components/ui/error-banner";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { toast } from "sonner";
import { AttendancePanel, type RosterEntry } from "./AttendancePanel";
import WalkUpPanel from "./WalkUpPanel";

interface DetailResponse {
  session: {
    id: string;
    venueId: string;
    kind: "pickup" | "class";
    sportOrClassLabel: string;
    formatLabel: string | null;
    startsAt: string;
    endsAt: string;
    capacity: number;
    capacityMale: number | null;
    capacityFemale: number | null;
    skillLevel: string;
    audience: string;
    membersOnly: boolean;
    sessionRateCents: number | null;
    memberRateCents: number | null;
    teamCount: number;
    teamColors: string[];
    status: "scheduled" | "cancelled" | "completed";
  };
  venue: { id: string; name: string } | null;
  roster: RosterEntry[];
  waitlist: RosterEntry[];
  cancelled: RosterEntry[];
}

interface AdminSessionDetailProps {
  sessionId: string;
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function AdminSessionDetail({ sessionId }: AdminSessionDetailProps) {
  useHydrationBeacon();

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const [repeatUntil, setRepeatUntil] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = async () => {
    try {
      const res = await fetch(`/api/admin/dropin/sessions/${sessionId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as DetailResponse;
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
  }, [sessionId]);

  const cancelSession = async () => {
    if (
      !confirm(
        "Cancel this session and refund all bookings? This cannot be undone.",
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/dropin/sessions/${sessionId}/cancel`,
        { method: "POST" },
      );
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Cancel failed");
        return;
      }
      toast.success(
        `Cancelled · ${json.refundedBookings}/${json.cancelledBookings} bookings refunded`,
      );
      await reload();
    } finally {
      setBusy(false);
    }
  };

  const submitRepeat = async () => {
    if (!repeatUntil) {
      toast.error("Pick a repeat-until date");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/admin/dropin/sessions/${sessionId}/repeat`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ untilDate: repeatUntil }),
        },
      );
      const json = await res.json();
      if (!res.ok) {
        toast.error(json.error ?? "Repeat failed");
        return;
      }
      toast.success(`Created ${json.count} weekly copies`);
      setRepeatOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const promoteWaitlister = async (bookingId: string) => {
    setBusy(true);
    try {
      // Reuses the customer cancel pipeline conceptually: hitting the
      // promotion endpoint is the proper move, but for MVP we surface a
      // direct refund-cancel which triggers promotion automatically when
      // the canceller was confirmed. The waitlist promotion endpoint
      // already runs on cron and is fired by free-spot opens. So for
      // explicit promote-now we can just rely on the user clicking
      // "claim" via the link we sent. For now, we just open the user
      // detail to surface their token.
      toast.info(
        "Promotion runs automatically when a confirmed booking is cancelled.",
      );
    } finally {
      setBusy(false);
    }
    void bookingId;
  };

  if (loading) return <LoadingSkeleton />;
  if (error) return <ErrorBanner message={error} />;
  if (!data) return null;

  const { session } = data;

  return (
    <div className="space-y-6">
      <a
        href="/admin/dropin/sessions"
        className="text-xs uppercase tracking-wider text-ink-muted hover:text-ink"
      >
        ← All sessions
      </a>

      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-ink">
            {session.sportOrClassLabel}
            {session.formatLabel && (
              <span className="text-ink-muted font-normal">
                {" "}
                · {session.formatLabel}
              </span>
            )}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {fmtDateTime(session.startsAt)} · {data.venue?.name ?? "—"}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="outline">{session.kind}</Badge>
            <Badge variant="secondary">
              {session.skillLevel.replace("_", " ")}
            </Badge>
            <Badge variant="secondary">
              {session.audience.replace("_", " ")}
            </Badge>
            {session.membersOnly && (
              <Badge className="bg-amber-100 text-amber-900 border-amber-200">
                Members only
              </Badge>
            )}
            {session.status !== "scheduled" && (
              <Badge variant="outline" className="bg-rose-100 text-rose-900 border-rose-200">
                {session.status}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <a href={`/admin/dropin/sessions/${sessionId}/edit`}>Edit</a>
          </Button>
          <Button
            variant="outline"
            disabled={busy || session.status !== "scheduled"}
            onClick={() => setRepeatOpen(true)}
          >
            Repeat weekly
          </Button>
          <Button
            variant="outline"
            disabled={busy || session.status !== "scheduled"}
            onClick={cancelSession}
            className="text-rose-700"
          >
            Cancel session
          </Button>
        </div>
      </header>

      <section className="rounded-xl border border-border bg-cream-2 p-5">
        <h2 className="font-semibold text-ink mb-3">Capacity</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-muted">
              Confirmed
            </div>
            <div className="text-2xl font-semibold text-ink">
              {data.roster.length} / {session.capacity}
            </div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-ink-muted">
              Waitlist
            </div>
            <div className="text-2xl font-semibold text-ink">
              {data.waitlist.length}
            </div>
          </div>
          {session.capacityMale != null && (
            <div>
              <div className="text-xs uppercase tracking-wider text-ink-muted">
                Male
              </div>
              <div className="text-2xl font-semibold text-ink">
                {data.roster.filter(
                  (r) =>
                    (r as unknown as { gender?: string }).gender === "male",
                ).length}{" "}
                / {session.capacityMale}
              </div>
            </div>
          )}
          {session.capacityFemale != null && (
            <div>
              <div className="text-xs uppercase tracking-wider text-ink-muted">
                Female
              </div>
              <div className="text-2xl font-semibold text-ink">
                {data.roster.filter(
                  (r) =>
                    (r as unknown as { gender?: string }).gender === "female",
                ).length}{" "}
                / {session.capacityFemale}
              </div>
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xl font-semibold text-ink">Roster</h2>
          <Sheet>
            <SheetTrigger asChild>
              <Button>+ Add walk-up</Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Walk-up registration</SheetTitle>
              </SheetHeader>
              <div className="mt-4">
                <WalkUpPanel sessionId={sessionId} />
              </div>
            </SheetContent>
          </Sheet>
        </div>
        <AttendancePanel
          sessionId={sessionId}
          roster={data.roster}
          teamColors={session.teamColors}
          onChange={reload}
        />
      </section>

      {data.waitlist.length > 0 && (
        <section>
          <h2 className="text-xl font-semibold text-ink mb-3">Waitlist</h2>
          <ul className="rounded-lg border border-border bg-cream-2 divide-y divide-border">
            {data.waitlist.map((w) => (
              <li
                key={w.id}
                className="px-4 py-3 flex items-center justify-between"
              >
                <div>
                  <div className="font-medium text-ink">
                    {w.firstName} {w.lastName}
                  </div>
                  <div className="text-xs text-ink-muted">{w.email}</div>
                  {w.status === "pending_claim" && w.promotionExpiresAt && (
                    <div className="text-xs text-amber-700 mt-0.5">
                      Pending claim · expires{" "}
                      {new Date(w.promotionExpiresAt).toLocaleString()}
                    </div>
                  )}
                </div>
                <Badge variant="outline" className="text-xs">
                  {w.status.replace("_", " ")}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Dialog open={repeatOpen} onOpenChange={setRepeatOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Repeat weekly</DialogTitle>
            <DialogDescription>
              Creates independent weekly copies of this session through the
              chosen end date. Editing one copy doesn't propagate to others.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="until">Repeat until</Label>
            <Input
              id="until"
              type="date"
              value={repeatUntil}
              onChange={(e) => setRepeatUntil(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRepeatOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button onClick={submitRepeat} disabled={busy}>
              {busy ? "Creating…" : "Create copies"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
