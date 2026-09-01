/**
 * Pure-function validators for the field-rental endpoints. No DB access —
 * unit-tested. Endpoints translate a returned error string into a 400/422.
 * Mirrors `src/lib/dropin/validators.ts`.
 */

export interface RentalRateCardPutBody {
  defaultHourlyRateCents?: number;
  cancelWindowHours?: number;
  bookingIncrementMinutes?: number;
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
  // Recurring-block settings. They live on the same rate card because they are
  // org policy, not per-deal terms; the block builder can still override the
  // deposit percent for a single block.
  depositPct?: number;
  balanceDueLeadDays?: number;
  blockHoldHours?: number;
  quoteMarkerTtlDays?: number;
}

/**
 * Inclusive bounds for the block settings. Each is a policy dial with an
 * obviously-wrong side: a 130% deposit, a balance due two years out, a hold
 * that never lapses, or a quote marker that squats on inventory for a season.
 */
const BLOCK_FIELD_BOUNDS = {
  depositPct: { min: 0, max: 100 },
  balanceDueLeadDays: { min: 0, max: 180 },
  blockHoldHours: { min: 1, max: 336 },
  quoteMarkerTtlDays: { min: 1, max: 90 },
} as const;

export function validateRentalRateCardPut(
  body: RentalRateCardPutBody,
): string | null {
  for (const key of [
    "defaultHourlyRateCents",
    "cancelWindowHours",
    "bookingIncrementMinutes",
    "minDurationMinutes",
    "maxDurationMinutes",
  ] as const) {
    const v = body[key];
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v) || v < 0) {
      return `${key} must be a non-negative integer`;
    }
  }
  if (body.cancelWindowHours !== undefined && body.cancelWindowHours > 24 * 30) {
    return "cancelWindowHours unrealistic (>30 days)";
  }
  for (const minuteKey of [
    "bookingIncrementMinutes",
    "minDurationMinutes",
    "maxDurationMinutes",
  ] as const) {
    if (body[minuteKey] !== undefined && body[minuteKey]! > 1440) {
      return `${minuteKey} unrealistic (>24 hours)`;
    }
  }
  // Cross-field check is request-scoped only — cannot catch inconsistency introduced by a partial update against a previously-stored value.
  if (
    body.minDurationMinutes !== undefined &&
    body.maxDurationMinutes !== undefined &&
    body.minDurationMinutes > body.maxDurationMinutes
  ) {
    return "minDurationMinutes cannot exceed maxDurationMinutes";
  }
  for (const key of [
    "depositPct",
    "balanceDueLeadDays",
    "blockHoldHours",
    "quoteMarkerTtlDays",
  ] as const) {
    const v = body[key];
    if (v === undefined) continue;
    const { min, max } = BLOCK_FIELD_BOUNDS[key];
    if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v)) {
      return `${key} must be an integer`;
    }
    if (v < min || v > max) return `${key} must be between ${min} and ${max}`;
  }
  return null;
}

const UUID_RX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PAYMENT_METHODS = ["card_online", "card_present", "cash", "comp"] as const;

export interface RentalBookingRequestBody {
  venueId?: string;
  fieldNumber?: number;
  startsAt?: string;
  endsAt?: string;
  partySize?: number;
  purpose?: string;
  waiverName?: string;
  waiverAccepted?: boolean;
}

export interface ValidateRentalBookingOpts {
  /**
   * True when the API layer has already resolved the renter's person and
   * confirmed they carry a valid annual liability waiver for this org (see
   * `hasValidLiabilityWaiver` in src/lib/consents/liability.ts). This
   * validator stays pure/DB-free — the caller does the lookup and passes the
   * verdict in.
   *
   * Relaxes the requirement whenever the renter is covered AND the client
   * did not explicitly DECLINE (`waiverAccepted: false`) — that covers the
   * fully-omitted case (a client that knows it's covered simply doesn't
   * render the checkbox) and any partial submission (e.g. `waiverAccepted:
   * true` with no name, or a name with no accepted flag): a partial is not a
   * signature, so the endpoint treats it exactly like an omission and stamps
   * the shared "on file" attribution. (A COMPLETE signature from a covered
   * renter is a different matter — the endpoint records it, dated; see clause
   * 4 of `recordLiabilityWaiver`'s caller contract. Either way this validator
   * lets it through.) An explicit `waiverAccepted: false` is the one signal
   * that overrides coverage — the box was shown and unchecked, which must not
   * be silently ignored.
   */
  waiverOnFile?: boolean;
}

export function validateRentalBookingRequest(
  body: RentalBookingRequestBody,
  opts: ValidateRentalBookingOpts = {},
): string | null {
  if (!body.venueId || !UUID_RX.test(body.venueId)) {
    return "venueId must be a valid id";
  }
  if (
    typeof body.fieldNumber !== "number" ||
    !Number.isInteger(body.fieldNumber) ||
    body.fieldNumber < 1
  ) {
    return "fieldNumber must be a positive integer";
  }
  const start = body.startsAt ? new Date(body.startsAt) : null;
  const end = body.endsAt ? new Date(body.endsAt) : null;
  if (!start || Number.isNaN(start.getTime())) return "startsAt must be a valid date";
  if (!end || Number.isNaN(end.getTime())) return "endsAt must be a valid date";
  if (end.getTime() <= start.getTime()) return "endsAt must be after startsAt";
  if (
    body.partySize !== undefined &&
    (typeof body.partySize !== "number" ||
      !Number.isInteger(body.partySize) ||
      body.partySize < 1)
  ) {
    return "partySize must be a positive integer";
  }
  // A covered renter bypasses the ask entirely UNLESS they explicitly
  // declined — any other value (omitted, partial, or true) is trusted to
  // server-side coverage, since the endpoint ignores it either way. See
  // ValidateRentalBookingOpts.waiverOnFile for the full rationale.
  const explicitlyDeclined = body.waiverAccepted === false;
  if (!(opts.waiverOnFile && !explicitlyDeclined)) {
    if (!body.waiverAccepted) return "waiver must be accepted to book";
    if (!body.waiverName || body.waiverName.trim().length === 0) {
      return "waiver signature name is required";
    }
  }
  return null;
}

export interface AdminRentalCreateBody extends RentalBookingRequestBody {
  renterName?: string;
  renterEmail?: string;
  renterPhone?: string;
  renterUserId?: string;
  paymentMethod?: (typeof PAYMENT_METHODS)[number];
  notes?: string;
}

export function validateAdminRentalCreate(
  body: AdminRentalCreateBody,
): string | null {
  if (!body.venueId || !UUID_RX.test(body.venueId)) {
    return "venueId must be a valid id";
  }
  if (
    typeof body.fieldNumber !== "number" ||
    !Number.isInteger(body.fieldNumber) ||
    body.fieldNumber < 1
  ) {
    return "fieldNumber must be a positive integer";
  }
  const start = body.startsAt ? new Date(body.startsAt) : null;
  const end = body.endsAt ? new Date(body.endsAt) : null;
  if (!start || Number.isNaN(start.getTime())) return "startsAt must be a valid date";
  if (!end || Number.isNaN(end.getTime())) return "endsAt must be a valid date";
  if (end.getTime() <= start.getTime()) return "endsAt must be after startsAt";
  if (!body.renterName || body.renterName.trim().length === 0) {
    return "renterName is required";
  }
  if (
    body.partySize !== undefined &&
    (typeof body.partySize !== "number" ||
      !Number.isInteger(body.partySize) ||
      body.partySize < 1)
  ) {
    return "partySize must be a positive integer";
  }
  if (
    !body.paymentMethod ||
    !PAYMENT_METHODS.includes(body.paymentMethod)
  ) {
    return `paymentMethod must be one of: ${PAYMENT_METHODS.join(", ")}`;
  }
  return null;
}
