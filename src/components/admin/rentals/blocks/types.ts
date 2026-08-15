/**
 * Shapes shared by the block builder panels and the blocks admin surfaces.
 *
 * The preview types mirror POST /api/admin/rentals/blocks/generate-preview
 * exactly: the panels render the server's arithmetic and never re-derive money
 * client-side, so the number on screen is always the number that commits.
 */

export type Storefront = "soccerone" | "aspire";

export interface LocationOption {
  id: string;
  name: string;
}

export interface VenueOption {
  id: string;
  name: string;
  locationId: string;
}

export interface PatternDayRow {
  /** 0 = Sun … 6 = Sat, in the org timezone. */
  weekday: number;
  /** An `<input type="time">` value; converted to startMinute on send. */
  startTime: string;
  durationMinutes: number;
  venueIds: string[];
}

export interface PatternFormState {
  brand: Storefront;
  locationId: string;
  days: PatternDayRow[];
  firstDate: string;
  lastDate: string;
}

export interface PreviewSession {
  key: string;
  date: string;
  venueId: string;
  venueName: string;
  fieldNumber: number;
  startsAt: string;
  endsAt: string;
  startMinute: number;
  durationMinutes: number;
  rateCardCents: number;
  allocatedCents: number;
  conflict: { reason: string } | null;
  competingQuote: { label: string; quotedAt: string } | null;
}

export interface PreviewQuote {
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  depositDueCents: number;
  balanceDueCents: number;
  balanceDueAt: string | null;
}

export interface PreviewResponse extends PreviewQuote {
  sessions: PreviewSession[];
  /**
   * Absent when the pattern generated nothing — the endpoint short-circuits an
   * empty list before it has a rate card to report.
   */
  rateCard?: {
    depositPct: number;
    balanceDueLeadDays: number;
    blockHoldHours: number;
    quoteMarkerTtlDays: number;
  };
  timeZone?: string;
}

export type BlockDiscount = { kind: "percent" | "amount"; value: number } | null;

export interface SessionOverride {
  startMinute?: number;
  durationMinutes?: number;
  venueId?: string;
}

/** A one-off session the admin appended by hand; instants travel as ISO. */
export interface ExtraSession {
  key: string;
  date: string;
  venueId: string;
  startMinute: number;
  durationMinutes: number;
  startsAt: string;
  endsAt: string;
}

/**
 * A row in the builder's session list: the last priced view of a session plus
 * whether it is selected. Unselected rows are not sent for pricing, so they
 * keep their previous descriptor and show no amount.
 */
export interface SessionRow extends PreviewSession {
  included: boolean;
}
