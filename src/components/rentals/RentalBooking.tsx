"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { AvailabilityGrid, type FieldAvailability } from "./AvailabilityGrid";
import { fetchRentalAvailability } from "@/lib/rentals/fetch-availability";
import { dateInTimeZone } from "@/lib/time/format-date";

interface AvailabilityResponse {
  venueName: string;
  date: string;
  fields: FieldAvailability[];
}

interface Props {
  venues: { id: string; name: string; fieldCount: number }[];
  /**
   * How many days ahead this user may book (server-resolved from membership
   * benefits; the API enforces the same limit). Defaults to the public
   * 7-day window.
   */
  bookingWindowDays?: number;
  /**
   * Whether the visitor has an active session. Signed-in users' contact
   * info comes from their account; signed-out visitors ("guests") request
   * with no account and must supply name/email/phone inline. Defaults to
   * false — an un-prop'd caller just shows the guest fields, which the
   * endpoint accepts either way.
   */
  signedIn?: boolean;
  /**
   * IANA timezone the facility's calendar day is anchored to. Defaults to
   * the org home timezone.
   */
  timeZone?: string;
}

function fmtTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function addMinutes(d: Date, mins: number): Date {
  return new Date(d.getTime() + mins * 60_000);
}

export default function RentalBooking({
  venues,
  bookingWindowDays = 7,
  signedIn = false,
  timeZone = "America/New_York",
}: Props) {
  useHydrationBeacon();

  // Computed per render, in the facility's timezone. Module scope would
  // freeze "today" at the SSR lambda's cold start (serving a days-old date
  // from warm functions, and a hydration mismatch against the client's
  // fresh value); UTC would roll to tomorrow at 8pm Eastern and block
  // same-evening bookings.
  const today = dateInTimeZone(timeZone);
  // Mirrors the server's advance-booking window so the picker can't offer
  // dates the API would reject; the API remains the authority.
  const maxDate = dateInTimeZone(
    timeZone,
    new Date(Date.now() + bookingWindowDays * 24 * 60 * 60 * 1000),
  );

  const [selectedVenueId, setSelectedVenueId] = useState(venues[0]?.id ?? "");
  const [date, setDate] = useState(today);
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [selectedFieldNumber, setSelectedFieldNumber] = useState<number | null>(null);
  const [slotStart, setSlotStart] = useState<Date | null>(null);
  const [slotBlockEnd, setSlotBlockEnd] = useState<Date | null>(null);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [partySize, setPartySize] = useState(4);
  const [purpose, setPurpose] = useState("");
  const [waiverName, setWaiverName] = useState("");
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [requestSubmitted, setRequestSubmitted] = useState(false);

  useEffect(() => {
    if (!selectedVenueId) return;
    setAvailability(null);
    setFetchError(null);
    setSelectedFieldNumber(null);
    setSlotStart(null);
    setSlotBlockEnd(null);
    setLoading(true);

    const run = async () => {
      try {
        setAvailability(
          await fetchRentalAvailability<AvailabilityResponse>(selectedVenueId, date),
        );
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : "Failed to load availability");
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [selectedVenueId, date]);

  const handleSlotClick = (fieldNumber: number, slot: Date, blockEnd: Date) => {
    setSelectedFieldNumber(fieldNumber);
    setSlotStart(slot);
    setSlotBlockEnd(blockEnd);
    setSubmitError(null);
    setRequestSubmitted(false);
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
          ...(!signedIn && {
            renterName: waiverName.trim(),
            renterEmail: guestEmail.trim(),
            renterPhone: guestPhone.trim() || undefined,
          }),
        }),
      });

      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        const msg = typeof body.error === "string" ? body.error : `Error ${res.status}`;
        if (res.status >= 500) toast.error(msg);
        setSubmitError(msg);
        return;
      }

      if (body.requested) {
        setRequestSubmitted(true);
        return;
      }
      // Legacy fallback (should not happen in request mode).
      window.location.href = "/dashboard/bookings";
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

  const DURATIONS = [60, 90, 120, 180, 240];

  const availableDurations =
    slotStart && slotBlockEnd
      ? DURATIONS.filter(
          (d) => slotStart.getTime() + d * 60_000 <= slotBlockEnd.getTime(),
        )
      : DURATIONS;

  // If the current selection no longer fits, reset to the largest available option.
  if (availableDurations.length > 0 && !availableDurations.includes(durationMinutes)) {
    setDurationMinutes(availableDurations[availableDurations.length - 1]!);
  }

  const hasAnyFreeBlocks = availability?.fields.some((f) => f.free.length > 0);
  const endTime = slotStart ? addMinutes(slotStart, durationMinutes) : null;
  const submitDisabled =
    submitting ||
    !waiverAccepted ||
    !waiverName.trim() ||
    !slotStart ||
    (!signedIn && !guestEmail.trim());

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
              min={today}
              max={maxDate}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-500"
            />
            <p className="mt-1 text-xs text-stone-500">
              Online booking opens {bookingWindowDays} days ahead — contact us for later dates.
            </p>
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

          {requestSubmitted ? (
            <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 space-y-2">
              <h3 className="text-sm font-semibold text-stone-900">Request submitted</h3>
              <p className="text-sm text-stone-600">
                Thanks — we've got your request for this slot. Our team will
                review it and email you a link to pay once it's approved.
                The slot is held for you in the meantime.
              </p>
            </div>
          ) : (
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
                  {availableDurations.map((d) => (
                    <option key={d} value={d}>
                      {d < 60
                        ? `${d}m`
                        : d % 60 === 0
                          ? `${d / 60}h`
                          : `${Math.floor(d / 60)}h ${d % 60}m`}
                    </option>
                  ))}
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

            {!signedIn && (
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-4 space-y-3">
                <h3 className="text-sm font-semibold text-stone-900">Your contact info</h3>
                <p className="text-xs text-stone-500">
                  No account needed — we&apos;ll email your approval and pay
                  link to this address.
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label htmlFor="guest-email" className="block text-sm font-medium text-stone-700 mb-1">
                      Email
                    </label>
                    <input
                      id="guest-email"
                      type="email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="guest-phone" className="block text-sm font-medium text-stone-700 mb-1">
                      Phone <span className="text-stone-400 font-normal">(optional)</span>
                    </label>
                    <input
                      id="guest-phone"
                      type="tel"
                      value={guestPhone}
                      onChange={(e) => setGuestPhone(e.target.value)}
                      placeholder="(555) 555-5555"
                      className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-500"
                    />
                  </div>
                </div>
              </div>
            )}

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
              <p className="text-xs text-stone-500">
                Every player must have a signed waiver on file to play. You&apos;ll
                confirm your roster and waivers once your request is approved.
              </p>
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
              {submitting ? "Submitting…" : "Request this slot"}
            </button>
          </form>
          )}
        </div>
      )}
    </div>
  );
}
