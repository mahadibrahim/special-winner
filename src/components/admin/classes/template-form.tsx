"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ErrorBanner } from "@/components/ui/error-banner";
import type { ClassSlotTemplate } from "@/lib/db/schema/classes";

interface TemplateFormProps {
  template?: ClassSlotTemplate;
  venues: { id: string; name: string }[];
}

const WEEKDAY_OPTIONS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

export default function TemplateForm({ template, venues }: TemplateFormProps) {
  const isEdit = template !== undefined;

  const [name, setName] = useState(template?.name ?? "");
  const [venueId, setVenueId] = useState(template?.venueId ?? "");
  const [sportLabel, setSportLabel] = useState(template?.sportLabel ?? "Soccer");
  const [weekday, setWeekday] = useState<string>(
    template ? String(template.weekday) : "1",
  );
  const [startTime, setStartTime] = useState(template?.startTime?.slice(0, 5) ?? "");
  const [durationMins, setDurationMins] = useState<string>(
    String(template?.durationMins ?? 55),
  );
  const [capacity, setCapacity] = useState<string>(
    template?.capacity != null ? String(template.capacity) : "",
  );
  const [minAge, setMinAge] = useState<string>(
    template?.minAge != null ? String(template.minAge) : "",
  );
  const [maxAge, setMaxAge] = useState<string>(
    template?.maxAge != null ? String(template.maxAge) : "",
  );

  // Price fields — stored as dollar strings ("" = null), mirrors tier-form.tsx.
  const [sessionRate, setSessionRate] = useState<string>(
    template?.sessionRateCents != null ? String(template.sessionRateCents / 100) : "",
  );
  const [memberRate, setMemberRate] = useState<string>(
    template?.memberRateCents != null ? String(template.memberRateCents / 100) : "",
  );

  const [active, setActive] = useState(template?.active ?? true);

  // Deactivate-with-teeth: unchecking "active" on a template that was active
  // checks whether it has upcoming materialized sessions and, if so, offers
  // to cancel them (refunding bookings) in the same save.
  const [checkingRoster, setCheckingRoster] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [upcomingSessionsCount, setUpcomingSessionsCount] = useState<number | null>(null);
  const [cancelFutureSessions, setCancelFutureSessions] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards against a stale roster-check response (from a toggle the admin
  // already reversed) landing after a newer one and clobbering state.
  const rosterAbortRef = useRef<AbortController | null>(null);

  async function handleActiveChange(checked: boolean) {
    setActive(checked);
    rosterAbortRef.current?.abort();
    if (!isEdit || !template.active || checked) {
      rosterAbortRef.current = null;
      setCheckingRoster(false);
      setShowCancelConfirm(false);
      setCancelFutureSessions(false);
      return;
    }
    // Was active, now being turned off — check for upcoming sessions.
    const controller = new AbortController();
    rosterAbortRef.current = controller;
    setCheckingRoster(true);
    try {
      const res = await fetch(`/api/admin/classes/templates/${template.id}/roster`, {
        signal: controller.signal,
      });
      if (res.ok) {
        const data = (await res.json()) as { upcomingSessions?: unknown[] };
        const count = data.upcomingSessions?.length ?? 0;
        setUpcomingSessionsCount(count);
        setShowCancelConfirm(count > 0);
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      // fail-soft: no confirm section if the roster check itself fails
    } finally {
      // Only the most recent in-flight check gets to clear the busy flag —
      // an aborted/superseded one must not stomp on the newer toggle's state.
      if (rosterAbortRef.current === controller) {
        setCheckingRoster(false);
        rosterAbortRef.current = null;
      }
    }
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (checkingRoster) {
      setError("Still checking upcoming sessions — try again in a moment.");
      return;
    }
    if (!venueId) {
      setError("Venue is required");
      return;
    }
    if (minAge !== "" && maxAge !== "" && Number(minAge) > Number(maxAge)) {
      setError("Min age must be less than or equal to max age");
      return;
    }

    setBusy(true);
    try {
      const url = template
        ? `/api/admin/classes/templates/${template.id}`
        : "/api/admin/classes/templates";
      const method = template ? "PUT" : "POST";
      const body: Record<string, unknown> = {
        name,
        venueId,
        sportLabel,
        minAge: minAge === "" ? null : Number(minAge),
        maxAge: maxAge === "" ? null : Number(maxAge),
        weekday: Number(weekday),
        startTime,
        durationMins: Number(durationMins) || 55,
        capacity: Number(capacity),
        sessionRateDollars: sessionRate === "" ? null : Number(sessionRate),
        memberRateDollars: memberRate === "" ? null : Number(memberRate),
        active,
      };
      if (isEdit && !active) {
        body.cancelFutureSessions = cancelFutureSessions;
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError((b as { error?: string }).error ?? "Save failed");
        return;
      }

      const data = (await res.json().catch(() => ({}))) as {
        sessionsCancelled?: number;
        bookingsRefunded?: number;
        familiesNotified?: number;
      };
      const parts = [isEdit ? "Class updated" : "Class created"];
      if (data.sessionsCancelled != null) {
        parts.push(
          `${data.sessionsCancelled} session${data.sessionsCancelled === 1 ? "" : "s"} cancelled, ${data.bookingsRefunded ?? 0} booking${(data.bookingsRefunded ?? 0) === 1 ? "" : "s"} refunded`,
        );
      }
      if (data.familiesNotified) {
        parts.push(
          `${data.familiesNotified} famil${data.familiesNotified === 1 ? "y" : "ies"} notified of the schedule change`,
        );
      }
      toast.success(parts.join(" · "));
      window.location.href = "/admin/classes";
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6 max-w-2xl">
      <header className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <a
            href="/admin/classes"
            className="text-xs uppercase tracking-wider text-ink-muted hover:text-ink"
          >
            ← All classes
          </a>
          <h1 className="text-2xl font-bold text-ink mt-2">
            {isEdit ? template.name : "New class"}
          </h1>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => handleActiveChange(e.target.checked)}
          />
          Active
        </label>
      </header>

      {error && <ErrorBanner message={error} />}

      {checkingRoster && (
        <p className="text-xs text-ink-muted">Checking for upcoming sessions…</p>
      )}

      {showCancelConfirm && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 space-y-2">
          <p>
            {upcomingSessionsCount} upcoming session
            {upcomingSessionsCount === 1 ? "" : "s"}{" "}
            {upcomingSessionsCount === 1 ? "exists" : "exist"} for this class. Cancel{" "}
            {upcomingSessionsCount === 1 ? "it" : "them"} too? Bookings will be refunded.
          </p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={cancelFutureSessions}
              onChange={(e) => setCancelFutureSessions(e.target.checked)}
            />
            Cancel {upcomingSessionsCount} upcoming session
            {upcomingSessionsCount === 1 ? "" : "s"} and refund bookings
          </label>
        </div>
      )}

      <div className="space-y-5">
        <h2 className="font-semibold text-ink text-lg">Details</h2>

        <div>
          <Label htmlFor="template-name">Name</Label>
          <Input
            id="template-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="venue">Venue</Label>
            <Select value={venueId} onValueChange={setVenueId}>
              <SelectTrigger id="venue" className="w-full">
                <SelectValue placeholder="Pick a venue" />
              </SelectTrigger>
              <SelectContent>
                {venues.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="sport-label">Sport</Label>
            <Input
              id="sport-label"
              value={sportLabel}
              onChange={(e) => setSportLabel(e.target.value)}
              placeholder="e.g. Soccer"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="weekday">Day of week</Label>
            <Select value={weekday} onValueChange={setWeekday}>
              <SelectTrigger id="weekday" className="w-full">
                <SelectValue placeholder="Pick a day" />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="start-time">Start time</Label>
            <Input
              id="start-time"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="duration">Duration (minutes)</Label>
            <Input
              id="duration"
              type="number"
              min="1"
              step="1"
              value={durationMins}
              onChange={(e) => setDurationMins(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="capacity">Capacity</Label>
            <Input
              id="capacity"
              type="number"
              min="1"
              step="1"
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="min-age">Min age</Label>
            <Input
              id="min-age"
              type="number"
              min="0"
              step="1"
              value={minAge}
              onChange={(e) => setMinAge(e.target.value)}
              placeholder="e.g. 6"
            />
          </div>
          <div>
            <Label htmlFor="max-age">Max age</Label>
            <Input
              id="max-age"
              type="number"
              min="0"
              step="1"
              value={maxAge}
              onChange={(e) => setMaxAge(e.target.value)}
              placeholder="e.g. 8"
            />
          </div>
        </div>
      </div>

      <div className="space-y-5">
        <h2 className="font-semibold text-ink text-lg">Pricing</h2>
        <p className="text-xs text-ink-muted -mt-3">
          Charged only for a make-up booking once a child's monthly allotment is used up.
          Leave blank to fall back to the org's drop-in rate card.
        </p>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label htmlFor="session-rate">Session rate ($)</Label>
            <Input
              id="session-rate"
              type="number"
              min="0"
              step="0.01"
              value={sessionRate}
              onChange={(e) => setSessionRate(e.target.value)}
              placeholder="e.g. 25"
            />
          </div>
          <div>
            <Label htmlFor="member-rate">Member rate ($)</Label>
            <Input
              id="member-rate"
              type="number"
              min="0"
              step="0.01"
              value={memberRate}
              onChange={(e) => setMemberRate(e.target.value)}
              placeholder="e.g. 20"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={busy || checkingRoster}>
          {busy ? "Saving…" : checkingRoster ? "Checking sessions…" : isEdit ? "Save changes" : "Create class"}
        </Button>
        <Button type="button" variant="outline" asChild>
          <a href="/admin/classes">Back</a>
        </Button>
      </div>
    </form>
  );
}
