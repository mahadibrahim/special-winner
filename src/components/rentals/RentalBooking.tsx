"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { AvailabilityGrid, type FieldAvailability } from "./AvailabilityGrid";

interface AvailabilityResponse {
  venueName: string;
  date: string;
  fields: FieldAvailability[];
}

interface Props {
  venues: { id: string; name: string; fieldCount: number }[];
}

const TODAY = new Date().toISOString().slice(0, 10);

function fmtTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function addMinutes(d: Date, mins: number): Date {
  return new Date(d.getTime() + mins * 60_000);
}

export default function RentalBooking({ venues }: Props) {
  useHydrationBeacon();

  const [selectedVenueId, setSelectedVenueId] = useState(venues[0]?.id ?? "");
  const [date, setDate] = useState(TODAY);
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [selectedFieldNumber, setSelectedFieldNumber] = useState<number | null>(null);
  const [slotStart, setSlotStart] = useState<Date | null>(null);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [partySize, setPartySize] = useState(4);
  const [purpose, setPurpose] = useState("");
  const [waiverName, setWaiverName] = useState("");
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedVenueId) return;
    setAvailability(null);
    setFetchError(null);
    setSelectedFieldNumber(null);
    setSlotStart(null);
    setLoading(true);

    const run = async () => {
      try {
        const res = await fetch(
          `/api/rentals/availability?venueId=${encodeURIComponent(selectedVenueId)}&date=${encodeURIComponent(date)}`,
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(typeof body.error === "string" ? body.error : `HTTP ${res.status}`);
        }
        setAvailability((await res.json()) as AvailabilityResponse);
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : "Failed to load availability");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [selectedVenueId, date]);

  const handleSlotClick = (fieldNumber: number, slot: Date) => {
    setSelectedFieldNumber(fieldNumber);
    setSlotStart(slot);
    setSubmitError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!slotStart || selectedFieldNumber === null) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch("/api/rentals/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId: selectedVenueId,
          fieldNumber: selectedFieldNumber,
          startsAt: slotStart.toISOString(),
          endsAt: addMinutes(slotStart, durationMinutes).toISOString(),
          partySize,
          purpose: purpose.trim() || undefined,
          waiverName: waiverName.trim(),
          waiverAccepted: true,
        }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = typeof body.error === "string" ? body.error : `Error ${res.status}`;
        if (res.status >= 500) toast.error(msg);
        setSubmitError(msg);
        return;
      }

      window.location.href =
        body.paymentRequired && body.checkoutUrl
          ? (body.checkoutUrl as string)
          : "/dashboard/bookings?rental=success";
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Network error";
      toast.error(msg);
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  if (venues.length === 0) {
    return (
      <EmptyState
        title="No rentable venues"
        description="Rentals are not currently enabled at any venue."
      />
    );
  }

  const hasAnyFreeBlocks = availability?.fields.some((f) => f.free.length > 0);
  const endTime = slotStart ? addMinutes(slotStart, durationMinutes) : null;
  const submitDisabled = submitting || !waiverAccepted || !waiverName.trim() || !slotStart;

  return (
    <div className="space-y-6">
      {/* Venue + date selectors */}
      <div className="rounded-xl border border-stone-200 bg-white p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="venue-select" className="block text-sm font-medium text-stone-700 mb-1">
              Venue
            </label>
            <select
              id="venue-select"
              value={selectedVenueId}
              onChange={(e) => setSelectedVenueId(e.target.value)}
              className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-500"
            >
              {venues.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="date-input" className="block text-sm font-medium text-stone-700 mb-1">
              Date
            </label>
            <input
              id="date-input"
              type="date"
              value={date}
              min={TODAY}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-500"
            />
          </div>
        </div>
      </div>

      {/* Availability */}
      {loading && <LoadingSkeleton rows={4} />}
      {fetchError && !loading && (
        <ErrorBanner message={fetchError} onDismiss={() => setFetchError(null)} />
      )}
      {!loading && !fetchError && availability && !hasAnyFreeBlocks && (
        <EmptyState title="No availability" description="Try a different date or venue." />
      )}
      {!loading && !fetchError && availability && hasAnyFreeBlocks && (
        <AvailabilityGrid
          fields={availability.fields}
          selectedFieldNumber={selectedFieldNumber}
          slotStart={slotStart}
          onSlotClick={handleSlotClick}
        />
      )}

      {/* Booking form */}
      {selectedFieldNumber !== null && slotStart !== null && (
        <div className="rounded-xl border border-stone-200 bg-white p-5">
          <h2 className="text-base font-semibold text-stone-900 mb-4">
            Booking details — Field {selectedFieldNumber}, {fmtTime(slotStart)}
            {endTime && ` – ${fmtTime(endTime)}`}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="duration-select" className="block text-sm font-medium text-stone-700 mb-1">
                  Duration
                </label>
                <select
                  id="duration-select"
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-500"
                >
                  <option value={60}>1h</option>
                  <option value={90}>1.5h</option>
                  <option value={120}>2h</option>
                  <option value={180}>3h</option>
                  <option value={240}>4h</option>
                </select>
              </div>
              <div>
                <label htmlFor="party-size" className="block text-sm font-medium text-stone-700 mb-1">
                  Party size
                </label>
                <input
                  id="party-size"
                  type="number"
                  min={1}
                  value={partySize}
                  onChange={(e) => setPartySize(Math.max(1, Number(e.target.value)))}
                  className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-500"
                />
              </div>
            </div>

            <div>
              <label htmlFor="purpose" className="block text-sm font-medium text-stone-700 mb-1">
                Purpose <span className="text-stone-400 font-normal">(optional)</span>
              </label>
              <input
                id="purpose"
                type="text"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="e.g. team practice, birthday party"
                className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-500"
              />
            </div>

            {/* Waiver */}
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 space-y-3">
              <h3 className="text-sm font-semibold text-stone-900">Liability waiver</h3>
              <p className="text-sm text-stone-600">
                I acknowledge the inherent risks of recreational sports activity and waive
                Aspire Sports from liability for injuries that may occur during this rental.
                I confirm that all participants are aware of and accept these risks.
              </p>
              <div>
                <label htmlFor="waiver-name" className="block text-sm font-medium text-stone-700 mb-1">
                  Your full legal name
                </label>
                <input
                  id="waiver-name"
                  type="text"
                  value={waiverName}
                  onChange={(e) => setWaiverName(e.target.value)}
                  placeholder="Your full legal name"
                  className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-500"
                />
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={waiverAccepted}
                  onChange={(e) => setWaiverAccepted(e.target.checked)}
                  className="h-4 w-4 rounded border-stone-300 text-stone-900 focus:ring-stone-500"
                />
                <span className="text-sm text-stone-700">I accept</span>
              </label>
            </div>

            {endTime && (
              <p className="text-sm text-stone-500">Ends at {fmtTime(endTime)}</p>
            )}

            {submitError && (
              <ErrorBanner message={submitError} onDismiss={() => setSubmitError(null)} />
            )}

            <button
              type="submit"
              disabled={submitDisabled}
              className="w-full rounded-md bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-700 focus:outline-none focus:ring-2 focus:ring-stone-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Working…" : "Continue to payment"}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
