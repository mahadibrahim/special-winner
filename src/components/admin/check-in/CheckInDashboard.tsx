"use client";

import { useEffect, useState } from "react";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { EventCard } from "./EventCard";
import { Drawer } from "./Drawer";
import { groupSpacesByLocation } from "@/lib/admin/group-spaces";

interface Venue {
  id: string;
  name: string;
  location: { name: string };
}

interface DayEvent {
  kind: "drop_in_session" | "game" | "field_rental";
  id: string;
  startsAt: string;
  endsAt: string;
  fieldNumber: number | null;
  title: string;
  subtitle: string | null;
  counts: { expected: number; waiversOutstanding: number; checkedIn: number };
}

interface DayData {
  venueName: string;
  date: string;
  events: DayEvent[];
}

const todayIso = (): string => new Date().toISOString().slice(0, 10);

export default function CheckInDashboard({ venues }: { venues: Venue[] }) {
  useHydrationBeacon();
  const [venueId, setVenueId] = useState<string>(venues[0]?.id ?? "");
  const [date, setDate] = useState<string>(todayIso());
  const [data, setData] = useState<DayData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openEvent, setOpenEvent] = useState<{
    kind: DayEvent["kind"];
    id: string;
  } | null>(null);

  useEffect(() => {
    if (!venueId) return;
    let alive = true;

    const fetchDay = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/admin/check-in/day?venueId=${venueId}&date=${date}`
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          if (alive) setError(body.error ?? `Failed (${res.status})`);
          return;
        }
        const body = await res.json();
        if (alive) setData(body);
      } catch (err) {
        if (alive)
          setError(err instanceof Error ? err.message : "Network error");
      } finally {
        if (alive) setLoading(false);
      }
    };

    fetchDay();
    const interval = setInterval(fetchDay, 5_000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [venueId, date]);

  if (venues.length === 0) {
    return (
      <EmptyState
        title="No spaces yet"
        description="Add at least one active space at this organization to use check-in."
      />
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Today&apos;s check-in</h1>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span>Space</span>
            <select
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              className="border rounded px-2 py-1"
            >
              {groupSpacesByLocation(venues).map((group) => (
                <optgroup key={group.locationName} label={group.locationName}>
                  {group.spaces.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <span>Date</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="border rounded px-2 py-1"
            />
          </label>
        </div>
      </header>

      {error && <ErrorBanner message={error} />}

      {loading && !data && <LoadingSkeleton />}

      {data && data.events.length === 0 && (
        <EmptyState
          title="Nothing scheduled"
          description={`No events at ${data.venueName} on ${date}.`}
        />
      )}

      {data && data.events.length > 0 && (
        <div className="space-y-3">
          {data.events.map((ev) => (
            <EventCard
              key={`${ev.kind}-${ev.id}`}
              event={ev}
              onOpen={() => setOpenEvent({ kind: ev.kind, id: ev.id })}
            />
          ))}
        </div>
      )}

      {openEvent && (
        <Drawer
          kind={openEvent.kind}
          id={openEvent.id}
          onClose={() => setOpenEvent(null)}
        />
      )}
    </div>
  );
}
