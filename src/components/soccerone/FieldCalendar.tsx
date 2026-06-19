"use client";

import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";
import { quoteRentalCents } from "@/lib/rentals/soccerone-pricing";
import { useHydrationBeacon } from "@/lib/hooks/use-hydration-beacon";

// --- Live availability types ---

/** A free time block returned by /api/rentals/availability. */
interface FreeBlock {
  startsAt: string; // ISO
  endsAt: string;   // ISO
}

interface FieldAvailability {
  fieldNumber: number;
  free: FreeBlock[];
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
 * True if the integer hour `h` (e.g. 19 = 7pm) is inside any free block
 * for the given field on the selected date.
 * NOTE: The availability API returns free blocks in UTC. The hour is treated
 * as a wall-clock hour on the selected date (assumed local to the venue).
 * For now we do a simple hour-in-block check using the date string directly.
 */
function isHourBookable(
  field: FieldAvailability | undefined,
  dateStr: string,
  h: number,
): boolean {
  if (!field) return false;
  const hourStart = new Date(
    `${dateStr}T${String(h).padStart(2, "0")}:00:00.000Z`,
  ).getTime();
  const hourEnd = hourStart + 60 * 60 * 1000;
  return field.free.some((b) => {
    const blockStart = new Date(b.startsAt).getTime();
    const blockEnd = new Date(b.endsAt).getTime();
    return blockStart <= hourStart && blockEnd >= hourEnd;
  });
}

/**
 * Find the end of the free block that contains the given hour slot.
 * Returns the block end time as a Date, or null if the slot isn't in any block.
 */
function getFreeBlockEnd(
  field: FieldAvailability | undefined,
  dateStr: string,
  h: number,
): Date | null {
  if (!field) return null;
  const hourStart = new Date(
    `${dateStr}T${String(h).padStart(2, "0")}:00:00.000Z`,
  ).getTime();
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
   * Member discount percentage (0–100). Pass from the server based on signed-in
   * user's membership status. Defaults to 0 (no discount shown).
   */
  memberDiscountPct?: number;
}

export function FieldCalendar({
  venues,
  initialDate,
  memberDiscountPct = 0,
}: FieldCalendarProps) {
  // Top-level client:load island on /rent; set the hydration beacon so e2e
  // waitForHydration() resolves (per CLAUDE.md Playwright conventions).
  useHydrationBeacon();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(initialDate ?? today);
  const [venueId, setVenueId] = useState<string | null>(venues[0]?.id ?? null);
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedField, setSelectedField] = useState(1);
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);

  // Duration in whole-hour increments (60, 120, 180, or 240 minutes).
  const [durationMinutes, setDurationMinutes] = useState(60);

  // Real booking state — this panel drives the same flow as the Aspire
  // /rentals page: waiver → POST /api/rentals/bookings → Stripe Checkout.
  const [partySize, setPartySize] = useState(8);
  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [waiverName, setWaiverName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [needsSignIn, setNeedsSignIn] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch availability whenever venueId or date changes
  useEffect(() => {
    if (!venueId) {
      setAvailability(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(
      `/api/rentals/availability?venueId=${encodeURIComponent(venueId)}&date=${encodeURIComponent(date)}`,
    )
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as AvailabilityResponse;
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
    ? new Date(`${date}T${String(selectedSlot.hour).padStart(2, "0")}:00:00.000Z`)
    : null;

  const freeBlockEnd = selectedSlot
    ? getFreeBlockEnd(currentField, date, selectedSlot.hour)
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
  // Booking grid slot hours are stored as UTC wall-clock labeled as local facility hours;
  // price in UTC so the tier matches the displayed hour.
  // Same engine as the server, so the display matches the charged amount.
  const standardCents = startsAt && endsAt ? quoteRentalCents(startsAt, endsAt, "UTC") : null;

  const memberCents =
    standardCents !== null && memberDiscountPct > 0
      ? Math.round(standardCents * (1 - memberDiscountPct / 100))
      : null;

  const handleSlotClick = (h: number) => {
    if (!isHourBookable(currentField, date, h)) return;
    setSelectedSlot({ field: selectedField, hour: h });
    setSubmitError(null);
    setNeedsSignIn(false);
    // Reset duration to 1h so we always start fresh on a new selection.
    setDurationMinutes(60);
  };

  // Same booking flow as the Aspire /rentals page (RentalBooking.tsx):
  // POST creates a 10-minute hold and returns a Stripe Checkout URL.
  // Pricing, member discounts, and conflicts are all server-side.
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
          waiverName: waiverName.trim(),
          waiverAccepted: true,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          setNeedsSignIn(true);
          return;
        }
        const msg =
          typeof body.error === "string" ? body.error : `Error ${res.status}`;
        setSubmitError(msg);
        return;
      }
      if (body.paymentRequired && body.checkoutUrl) {
        toast.success("Slot held — redirecting to payment…", { duration: 1200 });
        window.setTimeout(() => {
          window.location.href = body.checkoutUrl as string;
        }, 800);
      } else {
        window.location.href = "/dashboard/bookings?rental=success";
      }
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

  return (
    <div className="field-calendar-root">
      {/* Filter bar */}
      <div className="calendar-filters">
        <div className="filter-group">
          <label htmlFor="field-select" className="filter-label">Field</label>
          {venues.length > 1 ? (
            <select
              id="field-select"
              className="filter-select"
              value={venueId ?? ""}
              onChange={(e) => {
                setVenueId(e.target.value);
                setSelectedField(1);
                setSelectedSlot(null);
              }}
            >
              {venues.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          ) : (
            <select
              id="field-select"
              className="filter-select"
              value={selectedField}
              onChange={(e) => { setSelectedField(Number(e.target.value)); setSelectedSlot(null); }}
            >
              {fieldNumbers.map((n) => (
                <option key={n} value={n}>Field {n}</option>
              ))}
            </select>
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

        {/* Member savings note — contextual per discount status */}
        <div className="member-toggle-group">
          {memberDiscountPct > 0 ? (
            <span className="member-note">Member discount ({memberDiscountPct}%) applied at checkout</span>
          ) : (
            <span className="member-note">Members save up to 25% — sign in</span>
          )}
        </div>
      </div>

      <div className="calendar-layout">
        {/* Calendar grid */}
        <div className="calendar-grid-wrapper">
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
                const bookable = isHourBookable(currentField, date, h);
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
                        <span className="event-name">Unavailable</span>
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
                <h3 className="panel-title">Book Slot</h3>
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
                {memberCents !== null ? (
                  <p className="member-price-line">
                    Members: ${(memberCents / 100).toFixed(0)}{" "}
                    <span className="member-savings-badge">−{memberDiscountPct}%</span>
                  </p>
                ) : (
                  <p className="member-nudge">
                    Members save up to 25% —{" "}
                    <a
                      className="nudge-link"
                      href={`/signin?redirect=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/rent")}`}
                    >
                      sign in
                    </a>
                  </p>
                )}
              </div>

              {/* Waiver — required by POST /api/rentals/bookings, same as
                  the Aspire rentals flow. */}
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
              </div>

              <p className="panel-note">Final price confirmed at checkout · slot held 10 min while you pay</p>

              {needsSignIn ? (
                <a
                  className="panel-book-btn panel-book-link"
                  href={`/signin?redirect=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname : "/rent")}`}
                >
                  Sign in to book
                </a>
              ) : (
                <button
                  className="panel-book-btn"
                  onClick={handleBook}
                  disabled={submitting || !waiverAccepted || !waiverName.trim()}
                >
                  {submitting ? "Holding slot…" : "Book this slot"}
                </button>
              )}

              {submitError && <p className="panel-error" role="alert">{submitError}</p>}

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
              <p className="panel-empty-text">Select an available time slot on the calendar to book {selectedUnitLabel}.</p>
              <p className="panel-empty-rate">
                Tiered rates — peak evenings from <strong>$190</strong>
                {memberDiscountPct > 0
                  ? ` · member rate (${memberDiscountPct}% off) applied at checkout`
                  : " · members save up to 25%"}
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
        .member-toggle-group {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          padding-bottom: 2px;
        }
        .member-note {
          font-size: 0.8125rem;
          color: rgba(250,204,21,0.65);
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
        .member-price-line {
          font-size: 0.8125rem;
          color: rgba(74,222,128,0.85);
          margin: 0;
          text-align: right;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 0.375rem;
        }
        .member-savings-badge {
          font-size: 0.6875rem;
          font-weight: 700;
          background: rgba(74,222,128,0.15);
          color: #86efac;
          padding: 2px 7px;
          border-radius: var(--so-radius-pill);
          letter-spacing: 0.04em;
        }
        .member-nudge {
          font-size: 0.8125rem;
          color: rgba(250,204,21,0.65);
          margin: 0;
          text-align: right;
        }
        .nudge-link {
          color: #facc15;
          font-weight: 600;
          text-decoration: underline;
        }
        .panel-addons {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
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
