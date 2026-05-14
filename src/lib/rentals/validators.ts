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
}

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
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
      return `${key} must be a non-negative number`;
    }
  }
  if (
    body.minDurationMinutes !== undefined &&
    body.maxDurationMinutes !== undefined &&
    body.minDurationMinutes > body.maxDurationMinutes
  ) {
    return "minDurationMinutes cannot exceed maxDurationMinutes";
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

export function validateRentalBookingRequest(
  body: RentalBookingRequestBody,
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
    (typeof body.partySize !== "number" || body.partySize < 1)
  ) {
    return "partySize must be a positive integer";
  }
  if (!body.waiverAccepted) return "waiver must be accepted to book";
  if (!body.waiverName || body.waiverName.trim().length === 0) {
    return "waiver signature name is required";
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
    (typeof body.partySize !== "number" || body.partySize < 1)
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
