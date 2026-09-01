"use client";

import React, { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { quoteRentalCents } from "@/lib/rentals/soccerone-pricing";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";
import { zonedHourToUtc } from "@/lib/activity-tracking/tz-day";
import { fieldInfoForName, fieldColorForName } from "@/lib/soccerone/field-info";
import { fetchRentalAvailability } from "@/lib/rentals/fetch-availability";
import {
  rentalWaiverBlocksSubmit,
  rentalWaiverCovered,
  rentalWaiverRequestFields,
} from "@/lib/rentals/waiver-fields";
import { dateInTimeZone } from "@/lib/time/format-date";

// --- Live availability types ---

/** A free time block returned by /api/rentals/availability. */
interface FreeBlock {
  startsAt: string; // ISO
  endsAt: string;   // ISO
}

/** A busy time block returned by /api/rentals/availability. */
interface BusyBlock {
  startsAt: string; // ISO
  endsAt: string;   // ISO
  reason: string;   // "Rented" | "Pickup Game" | "League Game" | "Closed" | "Reserved" | "Unavailable"
}

interface FieldAvailability {
  fieldNumber: number;
  free: FreeBlock[];
  busy: BusyBlock[];
}

interface AvailabilityResponse {
  venueName: string;
  date: string;
  fields: FieldAvailability[];
}

// 4pm (16:00) open through the last bookable block at 11pm, which ends at
// midnight close. The slot end label uses formatHour(hour + 1), so 24 must
// render as midnight.
const HOURS = Array.from({ length: 8 }, (_, i) => i + 16); // 4pm to midnight

// Whole-hour duration options in minutes; max 4h = 240 min.
const DURATIONS = [60, 120, 180, 240];

function formatHour(h: number) {
  if (h === 0 || h === 24) return "12:00 AM";
  if (h === 12) return "12:00 PM";
  if (h < 12) return `${h}:00 AM`;
  return `${h - 12}:00 PM`;
}

function formatDuration(mins: number): string {
  return `${mins / 60}h`;
}

/**
 * Day-of-week + full date for the day-nav header. `dateStr` is a plain
 * YYYY-MM-DD calendar date (same convention used everywhere else in this
 * file); parsed as UTC-midnight purely so the weekday/date text doesn't
 * shift with the browser's local timezone — it's label text, not an
 * instant, so it doesn't need zonedHourToUtc.
 */
function formatDayHeader(dateStr: string): { dow: string; full: string } {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return {
    dow: d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }),
    full: d.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }),
  };
}

/** Step a YYYY-MM-DD calendar date by `deltaDays`, clamped to [min, max]. */
function shiftDate(dateStr: string, deltaDays: number, min: string, max: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  const next = d.toISOString().slice(0, 10);
  if (next < min) return min;
  if (next > max) return max;
  return next;
}

/**
 * True if the integer hour `h` (e.g. 19 = 7pm) is inside any free block
 * for the given field on the selected date.
 * hour is local wall-clock in the org tz; convert to the UTC instant to match availability blocks.
 */
function isHourBookable(
  field: FieldAvailability | undefined,
  dateStr: string,
  h: number,
  timeZone: string,
): boolean {
  if (!field) return false;
  const hourStart = zonedHourToUtc(dateStr, h, timeZone).getTime();
  const hourEnd = hourStart + 60 * 60 * 1000;
  return field.free.some((b) => {
    const blockStart = new Date(b.startsAt).getTime();
    const blockEnd = new Date(b.endsAt).getTime();
    return blockStart <= hourStart && blockEnd >= hourEnd;
  });
}

/**
 * True if hour `h` on `dateStr` is at least `leadHours` hours from now.
 * UX mirror of the server's minLeadTimeHours check (Task 5) — the server
 * remains the source of truth; this just keeps near-term slots from
 * rendering as clickable when the request would 422.
 */
function meetsLeadTime(
  dateStr: string,
  h: number,
  timeZone: string,
  leadHours: number,
): boolean {
  const hourStart = zonedHourToUtc(dateStr, h, timeZone).getTime();
  return hourStart >= Date.now() + leadHours * 60 * 60_000;
}

/**
 * Return the reason string for the busy block covering the given hour slot,
 * or null if no busy block covers it (fallback: "Unavailable").
 */
function hourReason(
  field: FieldAvailability | undefined,
  dateStr: string,
  h: number,
  timeZone: string,
): string | null {
  if (!field) return null;
  const hourStart = zonedHourToUtc(dateStr, h, timeZone).getTime();
  const hourEnd = hourStart + 60 * 60 * 1000;
  const block = field.busy.find((b) => {
    const blockStart = new Date(b.startsAt).getTime();
    const blockEnd = new Date(b.endsAt).getTime();
    return blockStart <= hourStart && blockEnd >= hourEnd;
  });
  return block ? block.reason : null;
}

/**
 * Find the end of the free block that contains the given hour slot.
 * Returns the block end time as a Date, or null if the slot isn't in any block.
 */
function getFreeBlockEnd(
  field: FieldAvailability | undefined,
  dateStr: string,
  h: number,
  timeZone: string,
): Date | null {
  if (!field) return null;
  const hourStart = zonedHourToUtc(dateStr, h, timeZone).getTime();
  const hourEnd = hourStart + 60 * 60 * 1000;
  const block = field.free.find((b) => {
    const blockStart = new Date(b.startsAt).getTime();
    const blockEnd = new Date(b.endsAt).getTime();
    return blockStart <= hourStart && blockEnd >= hourEnd;
  });
  return block ? new Date(block.endsAt) : null;
}

interface SelectedSlot {
  field: number;
  hour: number;
}

export interface FieldCalendarVenue {
  id: string;
  name: string;
}

export interface FieldCalendarProps {
  /**
   * Rental-enabled venues at the current facility. Venues are modeled
   * one-per-physical-field (fieldCount=1), so when there are multiple the
   * "Field" selector switches venues; a single venue with fieldCount > 1
   * falls back to switching field numbers within it. Empty array shows an
   * empty state.
   */
  venues: FieldCalendarVenue[];
  /** Initial date (YYYY-MM-DD). Defaults to today. */
  initialDate?: string;
  /**
   * IANA timezone for the org/facility (e.g. "America/New_York"). Used to
   * resolve the correct pricing tier from wall-clock hour. Defaults to
   * "America/New_York" (SoccerOne's venue timezone).
   */
  timeZone?: string;
  /**
   * How many days ahead this user may book (server-resolved from membership
   * benefits; the API enforces the same limit). Defaults to the public
   * 7-day window.
   */
  bookingWindowDays?: number;
  /**
   * Minimum hours of advance notice a request needs (server-resolved from
   * the org's rate card; the API enforces the same limit). Defaults to the
   * public 48h window.
   */
  minLeadTimeHours?: number;
  /**
   * Whether the visitor has an active session. Signed-in users' contact
   * info comes from their account; signed-out visitors ("guests") request
   * with no account and must supply name/email/phone inline. Defaults to
   * false — an un-prop'd caller just shows the guest fields, which the
   * endpoint accepts either way.
   */
  signedIn?: boolean;
  /**
   * Whether this signed-in renter already holds a valid annual liability
   * waiver for the org (server-resolved by this page's own frontmatter via
   * `src/lib/rentals/waiver-on-file.ts`). When true the waiver block becomes a
   * short "waiver on file" note and NO waiver fields are sent — POST
   * /api/rentals/bookings re-checks the same predicate and stamps the booking
   * "On file (annual waiver)". Defaults to false and only strict `true`
   * skips: guests, un-prop'd callers and failed probes all ASK.
   */
  waiverOnFile?: boolean;
}

export function FieldCalendar({
  venues,
  initialDate,
  timeZone = "America/New_York",
  bookingWindowDays = 7,
  minLeadTimeHours = 48,
  signedIn = false,
  waiverOnFile = false,
}: FieldCalendarProps) {
  // Shared with the Aspire /rentals form — see
  // src/lib/rentals/waiver-fields.ts for the fail-toward-asking rules and why
  // both brands run one implementation.
  const waiverCovered = rentalWaiverCovered({ signedIn, waiverOnFile });
  // Top-level client:load island on /rent; set the hydration beacon so e2e
  // waitForHydration() resolves (per CLAUDE.md Playwright conventions).
  useHydrationBeacon();
  // Facility-timezone calendar days — a UTC "today" rolls over at 8pm
  // Eastern, shifting the whole picker window a day forward every evening.
  const today = dateInTimeZone(timeZone);
  // Last selectable date — mirrors the server's advance-booking window so the
  // picker can't offer dates the API would 422. UI-local date math is fine
  // here; the API remains the authority.
  const maxDate = dateInTimeZone(
    timeZone,
    new Date(Date.now() + bookingWindowDays * 24 * 60 * 60 * 1000),
  );
  // Default to the first bookable day rather than "today" — with the
  // minLeadTimeHours guard, every slot on "today" shows the 48h-notice
  // reason and nothing is actually requestable on load. Clamp within the
  // booking window in case minLeadTimeHours somehow exceeds it.
  let firstBookableDate = (() => {
    const d = dateInTimeZone(
      timeZone,
      new Date(Date.now() + minLeadTimeHours * 60 * 60 * 1000),
    );
    return d > maxDate ? maxDate : d;
  })();
  // Guarantee the default day's earliest slot clears the lead-time window, not
  // just the calendar-day math above. Depending on the current wall-clock hour
  // in the org tz, the first slot (HOURS[0]) on today+leadDays can still fall
  // inside the 48h window; if so, bump one more day (clamped to maxDate).
  if (!meetsLeadTime(firstBookableDate, HOURS[0]!, timeZone, minLeadTimeHours)) {
    firstBookableDate = shiftDate(firstBookableDate, 1, firstBookableDate, maxDate);
  }
  const [date, setDate] = useState(initialDate ?? firstBookableDate);
  const [venueId, setVenueId] = useState<string | null>(venues[0]?.id ?? null);
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedField, setSelectedField] = useState(1);
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);

  // Duration in whole-hour increments (60, 120, 180, or 240 minutes).
  const [durationMinutes, setDurationMinutes] = useState(60);

  // Real request state — this panel drives the same flow as the Aspire
  // /rentals page: waiver → POST /api/rentals/bookings → request held for
  // admin review → pay link emailed once approved.
  const [partySize, setPartySize] = useState(8);
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [waiverName, setWaiverName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [requestSubmitted, setRequestSubmitted] = useState(false);

  // Fetch availability whenever venueId or date changes
  useEffect(() => {
    if (!venueId) {
      setAvailability(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchRentalAvailability<AvailabilityResponse>(venueId, date)
      .then((body) => {
        if (!cancelled) {
          setAvailability(body);
          // Reset selected field to first available if current field no longer present
          if (body.fields.length > 0 && !body.fields.find((f) => f.fieldNumber === selectedField)) {
            setSelectedField(body.fields[0].fieldNumber);
          }
        }
      })
      .catch((e) => {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load availability");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [venueId, date]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentField = availability?.fields.find((f) => f.fieldNumber === selectedField);

  // Derive start Date and free block end for duration capping.
  const startsAt = selectedSlot
    ? zonedHourToUtc(date, selectedSlot.hour, timeZone)
    : null;

  const freeBlockEnd = selectedSlot
    ? getFreeBlockEnd(currentField, date, selectedSlot.hour, timeZone)
    : null;

  // Available durations: whole hours only, capped by remaining free block and
  // by the 4h maximum. Port of the RentalBooking capping pattern.
  const availableDurations =
    startsAt && freeBlockEnd
      ? DURATIONS.filter(
          (d) => startsAt.getTime() + d * 60_000 <= freeBlockEnd.getTime(),
        )
      : DURATIONS;

  // If the current selection no longer fits, reset to the largest available.
  useEffect(() => {
    if (availableDurations.length > 0 && !availableDurations.includes(durationMinutes)) {
      setDurationMinutes(availableDurations[availableDurations.length - 1]!);
    }
  }, [availableDurations, durationMinutes]);

  // Derived end time
  const endsAt = startsAt
    ? new Date(startsAt.getTime() + durationMinutes * 60_000)
    : null;

  // Live total — recomputed whenever start or duration changes.
  // Price in the org timezone — slots are constructed in org tz (see zonedHourToUtc).
  // Same engine as the server, so the display matches the charged amount.
  const standardCents = startsAt && endsAt ? quoteRentalCents(startsAt, endsAt, timeZone) : null;

  // Day-nav ‹ › — step the selected date, clamped to the same [today, maxDate]
  // window the date input already enforces.
  const goToPrevDay = () => {
    setDate((d) => shiftDate(d, -1, today, maxDate));
    setSelectedSlot(null);
  };
  const goToNextDay = () => {
    setDate((d) => shiftDate(d, 1, today, maxDate));
    setSelectedSlot(null);
  };

  const handleSlotClick = (h: number) => {
    if (
      !isHourBookable(currentField, date, h, timeZone) ||
      !meetsLeadTime(date, h, timeZone, minLeadTimeHours)
    )
      return;
    setSelectedSlot({ field: selectedField, hour: h });
    setSubmitError(null);
    setRequestSubmitted(false);
    // Reset duration to 1h so we always start fresh on a new selection.
    setDurationMinutes(60);
  };

  // Same request flow as the Aspire /rentals page (RentalBooking.tsx):
  // POST creates a request held for admin review; no Stripe interaction
  // happens here — payment is collected via a pay link after approval.
  const handleBook = async () => {
    if (!venueId || !selectedSlot || !startsAt || !endsAt) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/rentals/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          venueId,
          fieldNumber: selectedSlot.field,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          partySize,
          // Covered renters send NO waiver fields — the validator accepts
          // their absence only when the server independently agrees, and the
          // endpoint stamps the on-file attribution itself.
          ...rentalWaiverRequestFields(waiverCovered, waiverName),
          ...(!signedIn && {
            renterName: waiverName.trim(),
            renterEmail: guestEmail.trim(),
            renterPhone: guestPhone.trim() || undefined,
          }),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof body.error === "string" ? body.error : `Error ${res.status}`;
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
      setSubmitError(err instanceof Error ? err.message : "Network error");
    } finally {
      setSubmitting(false);
    }
  };

  // Field numbers to show in the selector (single-venue mode)
  const fieldNumbers =
    availability && availability.fields.length > 0
      ? availability.fields.map((f) => f.fieldNumber)
      : [selectedField];

  // Label for the currently selected bookable unit. Venues are modeled
  // one-per-field, so with multiple venues the venue NAME ("Field 2") is
  // the user-facing field label; within a single venue the field number is.
  const selectedUnitLabel =
    venues.length > 1
      ? (venues.find((v) => v.id === venueId)?.name ?? "Field")
      : `Field ${selectedField}`;

  // Venue name backing the currently-selected bookable unit, for the
  // per-field info card. Venues are modeled one-per-physical-field, so in
  // both selector modes the current selection maps to a single venue name
  // (or null if there isn't one to show, e.g. no venues at this facility).
  const selectedVenueName =
    venues.length > 1
      ? (venues.find((v) => v.id === venueId)?.name ?? null)
      : (venues[0]?.name ?? null);

  const selectedFieldInfo = selectedVenueName ? fieldInfoForName(selectedVenueName) : null;

  // "110 × 60" -> ["110 FT", "60 FT"] for the pitch diagram's dimension labels.
  const pitchDimLabels = selectedFieldInfo
    ? selectedFieldInfo.dimensions.split("×").map((s) => `${s.trim()} FT`)
    : null;

  return (
    <div className="field-calendar-root">
      {/* Filter bar */}
      <div className="calendar-filters">
        <div className="filter-group">
          <span className="filter-label">Field</span>
          {venues.length > 1 ? (
            <div className="field-chips" role="group" aria-label="Field">
              {venues.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={cn("field-chip", venueId === v.id && "field-chip--active")}
                  onClick={() => {
                    setVenueId(v.id);
                    setSelectedField(1);
                    setSelectedSlot(null);
                  }}
                >
                  <span className="field-chip-dot" style={{ background: fieldColorForName(v.name) }} />
                  {v.name}
                </button>
              ))}
            </div>
          ) : (
            <div className="field-chips" role="group" aria-label="Field">
              {fieldNumbers.map((n) => {
                const label = venues[0]?.name ?? `Field ${n}`;
                return (
                  <button
                    key={n}
                    type="button"
                    className={cn("field-chip", selectedField === n && "field-chip--active")}
                    onClick={() => { setSelectedField(n); setSelectedSlot(null); }}
                  >
                    <span className="field-chip-dot" style={{ background: fieldColorForName(label) }} />
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="filter-group">
          <label htmlFor="date-pick" className="filter-label">Date</label>
          <input
            id="date-pick"
            type="date"
            className="filter-input"
            value={date}
            min={today}
            max={maxDate}
            onChange={(e) => { setDate(e.target.value); setSelectedSlot(null); }}
          />
        </div>

        <div className="filter-group">
          <label htmlFor="party-size" className="filter-label">Players</label>
          <select
            id="party-size"
            className="filter-select"
            value={partySize}
            onChange={(e) => setPartySize(Number(e.target.value))}
          >
            {[2,4,5,6,7,8,10,12,14].map((n) => (
              <option key={n} value={n}>{n} players</option>
            ))}
          </select>
        </div>
      </div>

      {selectedFieldInfo && pitchDimLabels && (
        <div className="field-view-card">
          <div className="pitch-diagram">
            <svg viewBox="0 0 560 300" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <rect x="20" y="30" width="520" height="240" rx="8" stroke="#a3e635" strokeWidth="2" fill="rgba(163,230,53,0.04)" />
              <line x1="280" y1="30" x2="280" y2="270" stroke="rgba(163,230,53,0.35)" strokeWidth="1.5" />
              <circle cx="280" cy="150" r="42" stroke="rgba(163,230,53,0.35)" strokeWidth="1.5" />
              <rect x="20" y="105" width="30" height="90" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
              <rect x="510" y="105" width="30" height="90" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" />
              <text x="280" y="20" fill="rgba(255,255,255,0.6)" fontFamily="var(--so-font-mono)" fontSize="13" textAnchor="middle">
                {pitchDimLabels[0]}
              </text>
              <text x="10" y="150" fill="rgba(255,255,255,0.6)" fontFamily="var(--so-font-mono)" fontSize="13" textAnchor="middle" transform="rotate(-90 10 150)">
                {pitchDimLabels[1]}
              </text>
            </svg>
          </div>
          <div className="field-specs">
            <div className="field-spec-row">
              <span className="field-spec-k">Size</span>
              <span className="field-spec-v">{selectedFieldInfo.dimensions} ft</span>
            </div>
            <div className="field-spec-row">
              <span className="field-spec-k">Surface</span>
              <span className="field-spec-v">{selectedFieldInfo.surface}</span>
            </div>
            <div className="field-spec-row">
              <span className="field-spec-k">Format</span>
              <span className="field-spec-v">{selectedFieldInfo.format}</span>
            </div>
            <div className="field-spec-row">
              <span className="field-spec-k">Location</span>
              <span className="field-spec-v">{selectedFieldInfo.location}</span>
            </div>
          </div>
        </div>
      )}

      <div className="calendar-layout">
        {/* Calendar grid */}
        <div className="calendar-grid-wrapper">
          <div className="day-nav-header">
            <button
              type="button"
              className="day-nav-btn"
              onClick={goToPrevDay}
              disabled={date <= today}
              aria-label="Previous day"
            >
              ‹
            </button>
            <div className="day-nav-label">
              <div className="day-nav-dow">{formatDayHeader(date).dow}</div>
              <div className="day-nav-date">
                {formatDayHeader(date).full} · {selectedUnitLabel}
              </div>
            </div>
            <button
              type="button"
              className="day-nav-btn"
              onClick={goToNextDay}
              disabled={date >= maxDate}
              aria-label="Next day"
            >
              ›
            </button>
          </div>

          <div className="calendar-legend">
            <div className="legend-item">
              <span className="legend-swatch legend-available"></span>Available
            </div>
            <div className="legend-item">
              <span className="legend-swatch legend-booked"></span>Unavailable
            </div>
          </div>

          {/* Loading / error / empty states */}
          {loading && (
            <LoadingSkeleton rows={8} className="calendar-loading" />
          )}
          {!loading && error && (
            <ErrorBanner message={`Couldn't load availability: ${error}`} />
          )}
          {!loading && !error && !venueId && (
            <EmptyState
              title="No rentable fields at this facility"
              description="Try the other facility, or check back soon."
            />
          )}
          {!loading && !error && availability && availability.fields.length === 0 && (
            <EmptyState
              title="No rentable fields right now"
              description="Try a different date."
            />
          )}

          {!loading && !error && availability && availability.fields.length > 0 && (
            <div className="calendar-grid">
              {HOURS.map((h) => {
                const withinLead = meetsLeadTime(date, h, timeZone, minLeadTimeHours);
                const bookable =
                  isHourBookable(currentField, date, h, timeZone) && withinLead;
                const reason = !withinLead
                  ? `Requests need ${minLeadTimeHours}h notice — call the venue for sooner`
                  : hourReason(currentField, date, h, timeZone);
                const isSelected =
                  selectedSlot?.hour === h && selectedSlot?.field === selectedField;

                return (
                  <div
                    key={h}
                    className={cn(
                      "calendar-row",
                      !bookable && "calendar-row--booked",
                      bookable && "calendar-row--available",
                      isSelected && "calendar-row--selected",
                    )}
                    onClick={() => handleSlotClick(h)}
                    role={bookable ? "button" : undefined}
                    tabIndex={bookable ? 0 : -1}
                    aria-label={
                      bookable
                        ? `Select ${formatHour(h)} slot on ${selectedUnitLabel}`
                        : undefined
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") handleSlotClick(h);
                    }}
                  >
                    <span className="row-time">{formatHour(h)}</span>
                    {!bookable && (
                      <div className="row-event">
                        <span className="event-reason-chip">
                          {reason ?? "Unavailable"}
                        </span>
                      </div>
                    )}
                    {bookable && (
                      <div className="row-available-label">
                        <span>Available — click to select</span>
                      </div>
                    )}
                    {isSelected && (
                      <span className="row-selected-badge">Selected</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className={cn("booking-panel", selectedSlot && "booking-panel--visible")}>
          {selectedSlot ? (
            <>
              <div className="panel-header">
                <h3 className="panel-title">Request Slot</h3>
                <button className="panel-close" onClick={() => setSelectedSlot(null)} aria-label="Close">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <line x1="4" y1="4" x2="14" y2="14"/><line x1="14" y1="4" x2="4" y2="14"/>
                  </svg>
                </button>
              </div>

              <div className="panel-slot-info">
                <div className="slot-info-row">
                  <span className="slot-info-label">Field</span>
                  <span className="slot-info-value">{selectedUnitLabel}</span>
                </div>
                <div className="slot-info-row">
                  <span className="slot-info-label">Start</span>
                  <span className="slot-info-value">
                    {formatHour(selectedSlot.hour)}
                  </span>
                </div>
                <div className="slot-info-row">
                  <span className="slot-info-label">Duration</span>
                  <span className="slot-info-value">
                    <select
                      className="duration-select"
                      value={durationMinutes}
                      onChange={(e) => setDurationMinutes(Number(e.target.value))}
                      aria-label="Duration"
                    >
                      {availableDurations.map((d) => (
                        <option key={d} value={d}>{formatDuration(d)}</option>
                      ))}
                    </select>
                  </span>
                </div>
                <div className="slot-info-row">
                  <span className="slot-info-label">Ends</span>
                  <span className="slot-info-value">
                    {endsAt ? formatHour(selectedSlot.hour + durationMinutes / 60) : "—"}
                  </span>
                </div>
              </div>

              {/* Live total pricing */}
              <div className="panel-pricing">
                {standardCents !== null && (
                  <div className="panel-total">
                    <span className="total-label">Total</span>
                    <span className="total-amount">${(standardCents / 100).toFixed(0)}</span>
                  </div>
                )}
              </div>

              {requestSubmitted ? (
                <div className="request-success">
                  <h4 className="addons-heading">Request submitted</h4>
                  <p>
                    Thanks — we've got your request for this slot. Our team will
                    review it and email you a link to pay once it's approved.
                    The slot is held for you in the meantime.
                  </p>
                </div>
              ) : (
                <>
                  {!signedIn && (
                    <div className="panel-addons">
                      <h4 className="addons-heading">Your contact info</h4>
                      <input
                        type="email"
                        className="filter-input guest-contact-input"
                        placeholder="Email"
                        value={guestEmail}
                        onChange={(e) => setGuestEmail(e.target.value)}
                        aria-label="Email"
                      />
                      <input
                        type="tel"
                        className="filter-input guest-contact-input"
                        placeholder="Phone (optional)"
                        value={guestPhone}
                        onChange={(e) => setGuestPhone(e.target.value)}
                        aria-label="Phone (optional)"
                      />
                      <p className="waiver-requirement-note">
                        No account needed — we&apos;ll email your approval and pay
                        link to this address.
                      </p>
                    </div>
                  )}

                  {/* Waiver — required by POST /api/rentals/bookings, same as
                      the Aspire rentals flow, and skipped identically for a
                      renter already covered by the annual waiver. Styled with
                      this island's OWN classes: Astro scoped styles don't
                      reach React islands, and the shared cream Tailwind
                      palette inverts illegibly on the SoccerOne navy skin. */}
                  {waiverCovered ? (
                    <div className="panel-addons" data-waiver-on-file>
                      <h4 className="addons-heading">Waiver on file ✓</h4>
                      <p className="waiver-requirement-note waiver-onfile-note">
                        Your annual liability waiver covers this rental —
                        nothing to sign.
                      </p>
                      <p className="waiver-requirement-note">
                        Every player must still have a signed waiver on file to
                        play. You&apos;ll confirm your roster and waivers after
                        your request is approved.
                      </p>
                    </div>
                  ) : (
                  <div className="panel-addons">
                    <h4 className="addons-heading">Liability waiver</h4>
                    <label className="addon-row">
                      <input
                        type="checkbox"
                        className="addon-check"
                        checked={waiverAccepted}
                        onChange={(e) => setWaiverAccepted(e.target.checked)}
                      />
                      <span className="addon-label">
                        I accept the liability waiver: I understand indoor soccer
                        involves physical activity and inherent risk of injury, and
                        I release SoccerOne and Aspire Sports from liability for
                        injury arising from my rental.
                      </span>
                    </label>
                    <input
                      type="text"
                      className="filter-input waiver-name-input"
                      placeholder="Full name (typed signature)"
                      value={waiverName}
                      onChange={(e) => setWaiverName(e.target.value)}
                      aria-label="Full name (typed signature)"
                    />
                    <p className="waiver-requirement-note">
                      Every player must have a signed waiver on file to play. You&apos;ll
                      confirm your roster and waivers after your request is approved.
                    </p>
                  </div>
                  )}

                  <p className="panel-note">Final price confirmed once approved · your slot is held while we review</p>

                  <button
                    className="panel-book-btn"
                    onClick={handleBook}
                    disabled={
                      submitting ||
                      rentalWaiverBlocksSubmit({
                        covered: waiverCovered,
                        waiverAccepted,
                        waiverName,
                      }) ||
                      (!signedIn && !guestEmail.trim())
                    }
                  >
                    {submitting ? "Submitting…" : "Request this slot"}
                  </button>

                  {submitError && <p className="panel-error" role="alert">{submitError}</p>}
                </>
              )}

              <p className="panel-note">
                Cancel 14+ days out for a full refund. Within 14 days, bookings are final.
              </p>
            </>
          ) : (
            <div className="panel-empty">
              <div className="panel-empty-icon">
                <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                  <circle cx="24" cy="24" r="23" stroke="rgba(250,204,21,0.3)" strokeWidth="2"/>
                  <path d="M16 24h16M24 16v16" stroke="#facc15" strokeWidth="2.5" strokeLinecap="round"/>
                </svg>
              </div>
              <p className="panel-empty-text">Select an available time slot on the calendar to request {selectedUnitLabel}.</p>
              <p className="panel-empty-rate">
                Tiered rates — peak evenings from <strong>$190</strong>
              </p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .field-calendar-root {
          font-family: var(--so-font-body);
          color: rgba(255,255,255,0.85);
        }
        .calendar-filters {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          gap: 1.25rem;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 10px;
          padding: 1.25rem 1.5rem;
          margin-bottom: 2rem;
        }
        .filter-group {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }
        .filter-label {
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(250,204,21,0.8);
        }
        .filter-select, .filter-input {
          background: var(--so-navy);
          border: 1.5px solid rgba(255,255,255,0.15);
          border-radius: var(--so-radius-md);
          color: white;
          font-size: 0.9375rem;
          padding: 0.5rem 0.875rem;
          outline: none;
          cursor: pointer;
          transition: border-color 0.15s;
          min-width: 140px;
        }
        .filter-select:hover, .filter-input:hover {
          border-color: rgba(250,204,21,0.5);
        }
        .filter-select:focus, .filter-input:focus {
          border-color: #facc15;
        }
        .filter-select option {
          background: var(--so-navy);
          color: white;
        }
        /* Field chips — replace the old field <select> */
        .field-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 0.625rem;
        }
        .field-chip {
          display: flex;
          align-items: center;
          gap: 0.625rem;
          background: rgba(255,255,255,0.04);
          border: 1.5px solid rgba(255,255,255,0.15);
          border-radius: var(--so-radius-lg);
          color: white;
          font-family: var(--so-font-body);
          font-size: 0.9375rem;
          font-weight: 600;
          padding: 0.625rem 1rem;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s;
        }
        .field-chip:hover {
          border-color: rgba(163,230,53,0.4);
        }
        .field-chip--active {
          border-color: var(--so-lime);
          background: var(--so-lime-a12);
        }
        .field-chip-dot {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          box-shadow: 0 0 0 3px rgba(255,255,255,0.06);
          flex-shrink: 0;
        }
        /* Pitch diagram + specs */
        .field-view-card {
          display: grid;
          grid-template-columns: 200px 1fr;
          gap: 1.25rem;
          align-items: center;
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: var(--so-radius-md);
          padding: 1rem 1.5rem;
          margin-bottom: 1.5rem;
        }
        .pitch-diagram {
          background: var(--so-lime-a06);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: var(--so-radius-md);
          padding: 0.625rem;
        }
        .pitch-diagram svg {
          display: block;
          width: 100%;
          height: auto;
        }
        .field-specs {
          display: grid;
          gap: 0.75rem;
        }
        .field-spec-row {
          display: grid;
          grid-template-columns: 92px 1fr;
          gap: 0.625rem;
          align-items: baseline;
        }
        .field-spec-k {
          font-family: var(--so-font-mono);
          font-size: 0.625rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.45);
        }
        .field-spec-v {
          font-size: 0.875rem;
          font-weight: 600;
          color: rgba(255,255,255,0.9);
        }
        @media (max-width: 560px) {
          .field-view-card {
            grid-template-columns: 1fr;
          }
        }
        /* Day header with prev/next nav */
        .day-nav-header {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        .day-nav-btn {
          flex-shrink: 0;
          width: 40px;
          height: 40px;
          border-radius: var(--so-radius-md);
          border: 1.5px solid rgba(255,255,255,0.15);
          background: rgba(255,255,255,0.04);
          color: white;
          font-size: 1.125rem;
          display: grid;
          place-items: center;
          cursor: pointer;
          transition: border-color 0.15s, color 0.15s;
        }
        .day-nav-btn:hover:not(:disabled) {
          border-color: rgba(163,230,53,0.4);
          color: var(--so-lime);
        }
        .day-nav-btn:disabled {
          opacity: 0.35;
          cursor: default;
        }
        .day-nav-label {
          text-align: center;
          min-width: 220px;
        }
        .day-nav-dow {
          font-family: var(--so-font-display);
          text-transform: uppercase;
          letter-spacing: 0.02em;
          font-size: 1.625rem;
          line-height: 1;
          color: white;
        }
        .day-nav-date {
          font-family: var(--so-font-mono);
          font-size: 0.75rem;
          color: rgba(255,255,255,0.5);
          letter-spacing: 0.04em;
          margin-top: 0.25rem;
        }
        .calendar-layout {
          display: grid;
          grid-template-columns: 1fr 320px;
          gap: 1.5rem;
          align-items: start;
        }
        .calendar-grid-wrapper {
          min-width: 0;
        }
        .calendar-loading {
          padding: 1rem 0;
        }
        .calendar-legend {
          display: flex;
          gap: 1.25rem;
          margin-bottom: 0.875rem;
          flex-wrap: wrap;
        }
        .legend-item {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          font-size: 0.8125rem;
          color: rgba(255,255,255,0.6);
        }
        .legend-swatch {
          display: inline-block;
          width: 12px;
          height: 12px;
          border-radius: var(--so-radius-xs);
        }
        .legend-available { background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.2); }
        .legend-booked    { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); }
        .calendar-grid {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }
        .calendar-row {
          display: flex;
          align-items: center;
          gap: 1rem;
          padding: 0.625rem 1rem;
          border-radius: var(--so-radius-md);
          min-height: 48px;
          border-left: 3px solid transparent;
          transition: background 0.15s, border-color 0.15s;
          position: relative;
        }
        .calendar-row--booked {
          background: rgba(255,255,255,0.02);
          border-left-color: rgba(255,255,255,0.06);
          opacity: 0.5;
          cursor: default;
        }
        .calendar-row--available {
          background: rgba(255,255,255,0.04);
          border-left-color: rgba(255,255,255,0.1);
          cursor: pointer;
        }
        .calendar-row--available:hover {
          background: rgba(250,204,21,0.08);
          border-left-color: rgba(250,204,21,0.5);
        }
        .calendar-row--available:focus {
          outline: 2px solid #facc15;
          outline-offset: 1px;
        }
        .calendar-row--selected {
          background: rgba(250,204,21,0.12) !important;
          border-left-color: #facc15 !important;
          outline: 1.5px solid rgba(250,204,21,0.4);
        }
        .row-time {
          font-size: 0.8125rem;
          font-weight: 600;
          color: rgba(255,255,255,0.5);
          width: 72px;
          flex-shrink: 0;
          font-variant-numeric: tabular-nums;
        }
        .row-event {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex: 1;
          gap: 0.5rem;
        }
        .event-name {
          font-size: 0.9375rem;
          font-weight: 600;
          color: rgba(255,255,255,0.3);
        }
        /* Reason chip — bolder status badge on unavailable rows */
        .event-reason-chip {
          display: inline-flex;
          align-items: center;
          font-family: var(--so-font-body);
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(255,255,255,0.75);
          background: rgba(255,255,255,0.09);
          border: 1px solid rgba(255,255,255,0.18);
          border-radius: var(--so-radius-pill);
          padding: 3px 10px;
          white-space: nowrap;
        }
        .row-available-label {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex: 1;
          gap: 0.5rem;
        }
        .row-available-label span:first-child {
          font-size: 0.875rem;
          color: rgba(255,255,255,0.3);
        }
        .row-selected-badge {
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          background: #facc15;
          color: var(--so-navy);
          padding: 2px 8px;
          border-radius: var(--so-radius-pill);
          flex-shrink: 0;
        }
        /* Booking panel */
        .booking-panel {
          background: var(--so-navy-raised);
          border: 1.5px solid rgba(255,255,255,0.12);
          border-radius: var(--so-radius-xl);
          padding: 1.5rem;
          position: sticky;
          top: 88px;
          display: flex;
          flex-direction: column;
          gap: 1.25rem;
          min-height: 320px;
          transition: border-color 0.2s;
        }
        .booking-panel--visible {
          border-color: rgba(250,204,21,0.5);
        }
        .panel-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .panel-title {
          font-family: var(--so-font-body);
          font-size: 1.125rem;
          font-weight: 700;
          color: white;
          margin: 0;
        }
        .panel-close {
          background: none;
          border: none;
          color: rgba(255,255,255,0.4);
          cursor: pointer;
          padding: 4px;
          border-radius: var(--so-radius-sm);
          transition: color 0.15s;
        }
        .panel-close:hover { color: white; }
        .panel-slot-info {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          background: rgba(255,255,255,0.04);
          border-radius: var(--so-radius-lg);
          padding: 1rem;
        }
        .slot-info-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .slot-info-label {
          font-size: 0.8125rem;
          color: rgba(255,255,255,0.45);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 600;
        }
        .slot-info-value {
          font-size: 0.9375rem;
          font-weight: 600;
          color: white;
        }
        /* Duration select inside panel info — inherits slot-info-value sizing */
        .duration-select {
          background: rgba(255,255,255,0.08);
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: var(--so-radius-sm);
          color: white;
          font-size: 0.9375rem;
          font-weight: 600;
          padding: 0.125rem 0.5rem;
          outline: none;
          cursor: pointer;
          transition: border-color 0.15s;
        }
        .duration-select:hover {
          border-color: rgba(250,204,21,0.5);
        }
        .duration-select:focus {
          border-color: #facc15;
        }
        .duration-select option {
          background: var(--so-navy);
          color: white;
        }
        /* Live pricing block */
        .panel-pricing {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }
        .panel-total {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 0;
          border-top: 1px solid rgba(255,255,255,0.1);
        }
        .total-label {
          font-size: 0.875rem;
          color: rgba(255,255,255,0.5);
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-weight: 600;
        }
        .total-amount {
          font-family: var(--so-font-body);
          font-size: 1.75rem;
          font-weight: 800;
          color: #facc15;
          letter-spacing: -0.03em;
        }
        .panel-addons {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .request-success {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          background: rgba(250,204,21,0.08);
          border: 1px solid rgba(250,204,21,0.3);
          border-radius: var(--so-radius-lg);
          padding: 1rem;
        }
        .request-success p {
          font-size: 0.875rem;
          color: rgba(255,255,255,0.75);
          line-height: 1.5;
          margin: 0;
        }
        .addons-heading {
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(250,204,21,0.8);
          margin: 0 0 0.25rem;
        }
        .addon-row {
          display: flex;
          align-items: center;
          gap: 0.625rem;
          cursor: pointer;
          padding: 0.375rem 0;
          border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .addon-check {
          width: 14px;
          height: 14px;
          accent-color: #facc15;
          flex-shrink: 0;
          cursor: pointer;
        }
        .addon-label {
          flex: 1;
          font-size: 0.875rem;
          color: rgba(255,255,255,0.75);
        }
        .panel-book-btn {
          background: #facc15;
          color: var(--so-navy);
          font-family: var(--so-font-body);
          font-size: 1rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          border: none;
          border-radius: var(--so-radius-lg);
          padding: 0.875rem;
          cursor: pointer;
          width: 100%;
          transition: filter 0.15s, transform 0.1s;
        }
        .panel-book-btn:hover {
          filter: brightness(1.08);
          transform: translateY(-1px);
        }
        .panel-book-btn:disabled {
          opacity: 0.45;
          cursor: default;
          transform: none;
          filter: none;
        }
        .panel-book-link {
          display: block;
          text-align: center;
          text-decoration: none;
          box-sizing: border-box;
        }
        .waiver-name-input {
          width: 100%;
          margin-top: 0.625rem;
          box-sizing: border-box;
        }
        .guest-contact-input {
          width: 100%;
          margin-top: 0.5rem;
          box-sizing: border-box;
        }
        .waiver-requirement-note {
          font-size: 0.8125rem;
          color: rgba(255,255,255,0.55);
          line-height: 1.5;
          margin: 0.625rem 0 0;
        }
        /* The confirming line of the "waiver on file" panel — brighter than
           the muted requirement note beneath it, on the brand's own yellow
           accent rather than the shared cream palette's emerald (which reads
           as near-black against this navy skin). */
        .waiver-onfile-note {
          color: #facc15;
          margin-top: 0;
        }
        .panel-error {
          font-size: 0.8125rem;
          color: #f87171;
          margin: 0.5rem 0 0;
          text-align: center;
        }
        .panel-note {
          font-size: 0.75rem;
          color: rgba(255,255,255,0.3);
          margin: 0;
          text-align: center;
          line-height: 1.5;
        }
        .panel-empty {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 1rem;
          padding: 2rem 0;
          text-align: center;
        }
        .panel-empty-icon {
          opacity: 0.7;
        }
        .panel-empty-text {
          font-size: 0.9375rem;
          color: rgba(255,255,255,0.45);
          line-height: 1.55;
          margin: 0;
        }
        .panel-empty-rate {
          font-size: 0.875rem;
          color: rgba(250,204,21,0.6);
          margin: 0;
        }
        @media (max-width: 840px) {
          .calendar-layout {
            grid-template-columns: 1fr;
          }
          .booking-panel {
            position: static;
          }
        }
      `}</style>
    </div>
  );
}

export default FieldCalendar;
