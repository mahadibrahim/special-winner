"use client";

import React, { useState, useEffect } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ErrorBanner } from "@/components/ui/error-banner";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingSkeleton } from "@/components/ui/loading-skeleton";

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

const HOURS = Array.from({ length: 17 }, (_, i) => i + 7); // 7am to 11pm

function formatHour(h: number) {
  if (h === 12) return "12:00 PM";
  if (h < 12) return `${h}:00 AM`;
  return `${h - 12}:00 PM`;
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

interface SelectedSlot {
  field: number;
  hour: number;
}

interface AddOn {
  id: string;
  label: string;
  price: number;
  checked: boolean;
}

export interface FieldCalendarProps {
  /** UUID of the SoccerOne venue whose availability to show. When null/undefined the component shows an empty state. */
  venueId: string | null;
  /** Initial date (YYYY-MM-DD). Defaults to today. */
  initialDate?: string;
}

export function FieldCalendar({ venueId, initialDate }: FieldCalendarProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(initialDate ?? today);
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedField, setSelectedField] = useState(1);
  const [selectedSlot, setSelectedSlot] = useState<SelectedSlot | null>(null);
  const [addOns, setAddOns] = useState<AddOn[]>([
    { id: "balls",      label: "Rental Ball Set",           price: 10,  checked: false },
    { id: "scoreboard", label: "Scoreboard / Timer",        price: 15,  checked: false },
    { id: "ref",        label: "Certified Referee (1 hr)",  price: 55,  checked: false },
    { id: "bibs",       label: "Bib Set (20 pcs)",          price: 8,   checked: false },
  ]);
  const [isMember, setIsMember] = useState(false);

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

  const baseRate = 80;
  const memberRate = 72;
  const hourlyRate = isMember ? memberRate : baseRate;

  const addOnTotal = addOns.filter((a) => a.checked).reduce((sum, a) => sum + a.price, 0);
  const totalCost = hourlyRate + addOnTotal;

  const handleSlotClick = (h: number) => {
    if (!isHourBookable(currentField, date, h)) return;
    setSelectedSlot({ field: selectedField, hour: h });
  };

  // Online checkout for this calendar isn't wired yet (the real rental
  // booking flow exists at POST /api/rentals/bookings — wiring it here is
  // tracked in the SoccerOne hardening spec). Until then, hand off to
  // email instead of a dead end: no fake phone numbers, no stale dates.
  const handleBook = () => {
    toast("Email us to lock in this slot", {
      description:
        "Online field booking is almost here. Email play@gosoccerone.com with your date and time and we'll reserve it.",
      duration: 8000,
    });
    setSelectedSlot(null);
  };

  const toggleAddOn = (id: string) => {
    setAddOns((prev) =>
      prev.map((a) => (a.id === id ? { ...a, checked: !a.checked } : a)),
    );
  };

  // Field numbers to show in the selector
  const fieldNumbers =
    availability && availability.fields.length > 0
      ? availability.fields.map((f) => f.fieldNumber)
      : [selectedField];

  return (
    <div className="field-calendar-root">
      {/* Filter bar */}
      <div className="calendar-filters">
        <div className="filter-group">
          <label htmlFor="field-select" className="filter-label">Field</label>
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
          <select id="party-size" className="filter-select">
            {[2,4,5,6,7,8,10,12,14].map((n) => (
              <option key={n} value={n}>{n} players</option>
            ))}
          </select>
        </div>

        <div className="member-toggle-group">
          <label className="member-toggle-label">
            <input
              type="checkbox"
              className="member-toggle-check"
              checked={isMember}
              onChange={(e) => setIsMember(e.target.checked)}
            />
            <span>I'm a member</span>
          </label>
          <span className="member-note">Members save $8/hr</span>
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
              title="Pick a facility"
              description="Choose Downtown or Worthington above to see field availability."
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
                        ? `Select ${formatHour(h)} slot on Field ${selectedField}`
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
                        <span className="available-rate">${hourlyRate}/hr</span>
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
                  <span className="slot-info-value">Field {selectedSlot.field}</span>
                </div>
                <div className="slot-info-row">
                  <span className="slot-info-label">Time</span>
                  <span className="slot-info-value">
                    {formatHour(selectedSlot.hour)} – {formatHour(selectedSlot.hour + 1)}
                  </span>
                </div>
                <div className="slot-info-row">
                  <span className="slot-info-label">Duration</span>
                  <span className="slot-info-value">1 hour</span>
                </div>
                <div className="slot-info-row">
                  <span className="slot-info-label">Rate</span>
                  <span className="slot-info-value slot-rate">
                    ${hourlyRate}/hr
                    {isMember && <span className="member-badge">Member rate</span>}
                  </span>
                </div>
                {!isMember && (
                  <p className="member-upsell">
                    Members pay $72/hr — <button className="upsell-link" onClick={() => setIsMember(true)}>apply discount</button>
                  </p>
                )}
              </div>

              <div className="panel-addons">
                <h4 className="addons-heading">Add-ons</h4>
                {addOns.map((addon) => (
                  <label key={addon.id} className="addon-row">
                    <input
                      type="checkbox"
                      className="addon-check"
                      checked={addon.checked}
                      onChange={() => toggleAddOn(addon.id)}
                    />
                    <span className="addon-label">{addon.label}</span>
                    <span className="addon-price">+${addon.price}</span>
                  </label>
                ))}
              </div>

              <div className="panel-total">
                <span className="total-label">Estimated Total</span>
                <span className="total-amount">${totalCost}</span>
              </div>

              <button className="panel-book-btn" onClick={handleBook}>
                Book this slot
              </button>

              <p className="panel-note">
                No charge until confirmed. Cancellations 24h+ in advance receive a full refund.
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
              <p className="panel-empty-text">Select an available time slot on the calendar to book Field {selectedField}.</p>
              <p className="panel-empty-rate">
                From <strong>${isMember ? 72 : 80}/hr</strong>
                {isMember ? " (member rate)" : " · members from $72/hr"}
              </p>
            </div>
          )}
        </div>
      </div>

      <style>{`
        .field-calendar-root {
          font-family: 'Inter', sans-serif;
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
          background: #0a1929;
          border: 1.5px solid rgba(255,255,255,0.15);
          border-radius: 6px;
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
          background: #0a1929;
          color: white;
        }
        .member-toggle-group {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          padding-bottom: 2px;
        }
        .member-toggle-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          font-size: 0.9375rem;
          font-weight: 600;
          color: rgba(255,255,255,0.85);
        }
        .member-toggle-check {
          width: 16px;
          height: 16px;
          accent-color: #facc15;
          cursor: pointer;
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
          border-radius: 2px;
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
          border-radius: 6px;
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
        .available-rate {
          font-size: 0.875rem;
          font-weight: 600;
          color: rgba(250,204,21,0.7);
        }
        .row-selected-badge {
          font-size: 0.6875rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          background: #facc15;
          color: #0a1929;
          padding: 2px 8px;
          border-radius: 20px;
          flex-shrink: 0;
        }
        /* Booking panel */
        .booking-panel {
          background: #0d2035;
          border: 1.5px solid rgba(255,255,255,0.12);
          border-radius: 12px;
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
          font-family: 'Space Grotesk', sans-serif;
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
          border-radius: 4px;
          transition: color 0.15s;
        }
        .panel-close:hover { color: white; }
        .panel-slot-info {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          background: rgba(255,255,255,0.04);
          border-radius: 8px;
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
        .slot-rate {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        .member-badge {
          font-size: 0.6875rem;
          font-weight: 700;
          background: rgba(74,222,128,0.15);
          color: #86efac;
          padding: 2px 7px;
          border-radius: 20px;
          letter-spacing: 0.04em;
        }
        .member-upsell {
          font-size: 0.8125rem;
          color: rgba(250,204,21,0.65);
          margin: 0;
          text-align: right;
        }
        .upsell-link {
          background: none;
          border: none;
          color: #facc15;
          cursor: pointer;
          font-size: 0.8125rem;
          font-weight: 600;
          text-decoration: underline;
          padding: 0;
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
        .addon-price {
          font-size: 0.875rem;
          font-weight: 600;
          color: rgba(250,204,21,0.7);
        }
        .panel-total {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem 0;
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
          font-family: 'Space Grotesk', sans-serif;
          font-size: 1.75rem;
          font-weight: 800;
          color: #facc15;
          letter-spacing: -0.03em;
        }
        .panel-book-btn {
          background: #facc15;
          color: #0a1929;
          font-family: 'Space Grotesk', sans-serif;
          font-size: 1rem;
          font-weight: 700;
          letter-spacing: 0.02em;
          text-transform: uppercase;
          border: none;
          border-radius: 8px;
          padding: 0.875rem;
          cursor: pointer;
          width: 100%;
          transition: filter 0.15s, transform 0.1s;
        }
        .panel-book-btn:hover {
          filter: brightness(1.08);
          transform: translateY(-1px);
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
