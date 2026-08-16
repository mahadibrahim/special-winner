/**
 * Pure-function validation for the rental-block endpoints. No DB access, no
 * zod. Mirrors `src/lib/rentals/validators.ts`, returning a discriminated
 * result the endpoint turns into a 400.
 *
 * Money never arrives here: the block total is always derived server-side from
 * the rate card, so the only money-shaped inputs are the discount and the
 * deposit percent, both whole numbers.
 */
import type { BlockPattern } from "./generate";
import type { GeneratedSession } from "./generate";
import type { BlockDiscount } from "./pricing";
import type { BlockCommitMode } from "./create";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const BRANDS = ["soccerone", "aspire"] as const;
const MODES = ["draft", "send_deposit", "paid_offline", "internal_reserve"] as const;
const OFFLINE_METHODS = ["cash", "comp"] as const;

export interface CreateBlockBody {
  locationId: string;
  brand: "soccerone" | "aspire";
  label: string;
  renterUserId: string | null;
  renterName: string;
  renterEmail: string | null;
  renterPhone: string | null;
  partySize: number;
  purpose: string | null;
  notes: string | null;
  pattern: BlockPattern;
  excludedKeys: string[];
  sessionOverrides: Record<
    string,
    { startMinute?: number; durationMinutes?: number; venueId?: string }
  >;
  extraSessions: GeneratedSession[];
  discount: BlockDiscount;
  depositPct: number;
  mode: BlockCommitMode;
  offlinePaymentMethod: "cash" | "comp" | null;
  /**
   * The draft this build reopened, if any. Only the preview reads it, to skip
   * the draft's OWN quote markers when looking for competing quotes; the
   * create path ignores it (committing clears those markers anyway).
   */
  draftBlockId: string | null;
}

export type ValidateResult =
  | { ok: true; value: CreateBlockBody }
  | { ok: false; error: string };

const fail = (error: string): ValidateResult => ({ ok: false, error });

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function optionalString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

function validatePattern(raw: unknown): { ok: true; value: BlockPattern } | { ok: false; error: string } {
  if (!isPlainObject(raw)) return { ok: false, error: "pattern is required" };
  const timeZone = raw.timeZone;
  if (typeof timeZone !== "string" || timeZone.trim().length === 0) {
    return { ok: false, error: "pattern.timeZone is required" };
  }
  const firstDate = raw.firstDate;
  const lastDate = raw.lastDate;
  if (typeof firstDate !== "string" || !DATE_RX.test(firstDate)) {
    return { ok: false, error: "pattern.firstDate must be YYYY-MM-DD" };
  }
  if (typeof lastDate !== "string" || !DATE_RX.test(lastDate)) {
    return { ok: false, error: "pattern.lastDate must be YYYY-MM-DD" };
  }
  if (lastDate < firstDate) {
    return { ok: false, error: "pattern.lastDate must not precede pattern.firstDate" };
  }
  if (!Array.isArray(raw.days) || raw.days.length === 0) {
    return { ok: false, error: "pattern.days must be a non-empty array" };
  }

  const days: BlockPattern["days"] = [];
  for (const d of raw.days) {
    if (!isPlainObject(d)) return { ok: false, error: "each pattern.days entry must be an object" };
    const { weekday, startMinute, durationMinutes, venueIds } = d;
    if (!Number.isInteger(weekday) || (weekday as number) < 0 || (weekday as number) > 6) {
      return { ok: false, error: "pattern.days[].weekday must be an integer 0-6" };
    }
    if (!Number.isInteger(startMinute) || (startMinute as number) < 0 || (startMinute as number) > 1439) {
      return { ok: false, error: "pattern.days[].startMinute must be an integer 0-1439" };
    }
    if (
      !Number.isInteger(durationMinutes) ||
      (durationMinutes as number) < 15 ||
      (durationMinutes as number) > 480
    ) {
      return { ok: false, error: "pattern.days[].durationMinutes must be an integer 15-480" };
    }
    if (!Array.isArray(venueIds) || venueIds.length === 0) {
      return { ok: false, error: "pattern.days[].venueIds must be a non-empty array" };
    }
    for (const v of venueIds) {
      if (typeof v !== "string" || !UUID_RX.test(v)) {
        return { ok: false, error: "pattern.days[].venueIds must contain uuids" };
      }
    }
    days.push({
      weekday: weekday as number,
      startMinute: startMinute as number,
      durationMinutes: durationMinutes as number,
      // Deduped: the generator emits one session per venue per matching date,
      // so a venue listed twice would produce two identical sessions (same key,
      // same slot) and the renter would be charged twice for one field.
      venueIds: [...new Set(venueIds as string[])],
    });
  }

  let excludedDates: string[] | undefined;
  if (raw.excludedDates !== undefined) {
    if (!Array.isArray(raw.excludedDates)) {
      return { ok: false, error: "pattern.excludedDates must be an array" };
    }
    for (const d of raw.excludedDates) {
      if (typeof d !== "string" || !DATE_RX.test(d)) {
        return { ok: false, error: "pattern.excludedDates must contain YYYY-MM-DD strings" };
      }
    }
    excludedDates = raw.excludedDates as string[];
  }

  return { ok: true, value: { timeZone, firstDate, lastDate, days, excludedDates } };
}

function validateExtraSessions(
  raw: unknown,
): { ok: true; value: GeneratedSession[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "extraSessions must be an array" };

  const out: GeneratedSession[] = [];
  for (const s of raw) {
    if (!isPlainObject(s)) return { ok: false, error: "each extraSessions entry must be an object" };
    const { key, date, venueId, startMinute, durationMinutes, startsAt, endsAt } = s;
    if (typeof key !== "string" || key.length === 0) {
      return { ok: false, error: "extraSessions[].key is required" };
    }
    if (typeof date !== "string" || !DATE_RX.test(date)) {
      return { ok: false, error: "extraSessions[].date must be YYYY-MM-DD" };
    }
    if (typeof venueId !== "string" || !UUID_RX.test(venueId)) {
      return { ok: false, error: "extraSessions[].venueId must be a uuid" };
    }
    if (!Number.isInteger(startMinute) || (startMinute as number) < 0) {
      return { ok: false, error: "extraSessions[].startMinute must be a non-negative integer" };
    }
    if (
      !Number.isInteger(durationMinutes) ||
      (durationMinutes as number) < 15 ||
      (durationMinutes as number) > 480
    ) {
      return { ok: false, error: "extraSessions[].durationMinutes must be an integer 15-480" };
    }
    const start = new Date(String(startsAt));
    const end = new Date(String(endsAt));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return { ok: false, error: "extraSessions[].startsAt/endsAt must be a valid ordered instant pair" };
    }
    out.push({
      key,
      date,
      venueId,
      startMinute: startMinute as number,
      durationMinutes: durationMinutes as number,
      startsAt: start,
      endsAt: end,
    });
  }
  return { ok: true, value: out };
}

function validateOverrides(
  raw: unknown,
): { ok: true; value: CreateBlockBody["sessionOverrides"] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: {} };
  if (!isPlainObject(raw)) return { ok: false, error: "sessionOverrides must be an object" };

  const out: CreateBlockBody["sessionOverrides"] = {};
  for (const [key, edit] of Object.entries(raw)) {
    if (!isPlainObject(edit)) {
      return { ok: false, error: "each sessionOverrides entry must be an object" };
    }
    const value: { startMinute?: number; durationMinutes?: number; venueId?: string } = {};
    if (edit.startMinute !== undefined) {
      if (
        !Number.isInteger(edit.startMinute) ||
        (edit.startMinute as number) < 0 ||
        (edit.startMinute as number) > 1439
      ) {
        return { ok: false, error: "sessionOverrides[].startMinute must be an integer 0-1439" };
      }
      value.startMinute = edit.startMinute as number;
    }
    if (edit.durationMinutes !== undefined) {
      if (
        !Number.isInteger(edit.durationMinutes) ||
        (edit.durationMinutes as number) < 15 ||
        (edit.durationMinutes as number) > 480
      ) {
        return { ok: false, error: "sessionOverrides[].durationMinutes must be an integer 15-480" };
      }
      value.durationMinutes = edit.durationMinutes as number;
    }
    if (edit.venueId !== undefined) {
      if (typeof edit.venueId !== "string" || !UUID_RX.test(edit.venueId)) {
        return { ok: false, error: "sessionOverrides[].venueId must be a uuid" };
      }
      value.venueId = edit.venueId;
    }
    out[key] = value;
  }
  return { ok: true, value: out };
}

/** Every venue id the body can book, so the endpoint can tenancy-check them. */
export function collectVenueIds(value: CreateBlockBody): string[] {
  const ids = new Set<string>();
  for (const day of value.pattern.days) for (const v of day.venueIds) ids.add(v);
  for (const edit of Object.values(value.sessionOverrides)) {
    if (edit.venueId) ids.add(edit.venueId);
  }
  for (const s of value.extraSessions) ids.add(s.venueId);
  return [...ids];
}

export function validateCreateBlockBody(body: unknown): ValidateResult {
  if (!isPlainObject(body)) return fail("Body must be a JSON object");

  const { locationId, brand, label, renterName, partySize, depositPct, mode } = body;

  const resolvedMode = mode === undefined ? "draft" : mode;
  if (!MODES.includes(resolvedMode as BlockCommitMode)) {
    return fail("mode must be 'draft', 'send_deposit', 'paid_offline' or 'internal_reserve'");
  }
  // A reserve fences inventory rather than selling it: no renter, no money.
  const isReserve = resolvedMode === "internal_reserve";

  if (typeof locationId !== "string" || !UUID_RX.test(locationId)) {
    return fail("locationId must be a uuid");
  }
  const resolvedBrand = brand === undefined ? "soccerone" : brand;
  if (!BRANDS.includes(resolvedBrand as (typeof BRANDS)[number])) {
    return fail("brand must be 'soccerone' or 'aspire'");
  }
  if (typeof label !== "string" || label.trim().length === 0 || label.trim().length > 200) {
    return fail("label must be 1-200 characters");
  }
  if (!isReserve && (typeof renterName !== "string" || renterName.trim().length === 0)) {
    return fail("renterName is required");
  }
  const resolvedRenterName =
    typeof renterName === "string" && renterName.trim().length > 0
      ? renterName.trim()
      : label.trim();
  const renterEmail = optionalString(body.renterEmail);
  if (renterEmail !== null && !renterEmail.includes("@")) {
    return fail("renterEmail must be an email address");
  }
  if (body.renterUserId !== undefined && body.renterUserId !== null) {
    if (typeof body.renterUserId !== "string" || !UUID_RX.test(body.renterUserId)) {
      return fail("renterUserId must be a uuid");
    }
  }
  const resolvedPartySize = partySize === undefined ? 1 : partySize;
  if (
    !Number.isInteger(resolvedPartySize) ||
    (resolvedPartySize as number) < 1 ||
    (resolvedPartySize as number) > 200
  ) {
    return fail("partySize must be an integer 1-200");
  }

  const pattern = validatePattern(body.pattern);
  if (!pattern.ok) return fail(pattern.error);

  const overrides = validateOverrides(body.sessionOverrides);
  if (!overrides.ok) return fail(overrides.error);

  const extraSessions = validateExtraSessions(body.extraSessions);
  if (!extraSessions.ok) return fail(extraSessions.error);

  let excludedKeys: string[] = [];
  if (body.excludedKeys !== undefined && body.excludedKeys !== null) {
    if (!Array.isArray(body.excludedKeys) || body.excludedKeys.some((k) => typeof k !== "string")) {
      return fail("excludedKeys must be an array of strings");
    }
    excludedKeys = body.excludedKeys as string[];
  }

  let discount: BlockDiscount = null;
  if (!isReserve && body.discount !== undefined && body.discount !== null) {
    if (!isPlainObject(body.discount)) return fail("discount must be an object or null");
    const { kind, value } = body.discount;
    if (kind !== "percent" && kind !== "amount") {
      return fail("discount.kind must be 'percent' or 'amount'");
    }
    if (!Number.isInteger(value) || (value as number) < 0) {
      return fail("discount.value must be a non-negative integer");
    }
    if (kind === "percent" && (value as number) > 100) {
      return fail("a percent discount cannot exceed 100");
    }
    if (kind === "amount" && (value as number) % 100 !== 0) {
      return fail("a flat discount must be a whole number of dollars");
    }
    discount = { kind, value: value as number };
  }

  const resolvedDepositPct = isReserve ? 0 : depositPct === undefined ? 25 : depositPct;
  if (
    !Number.isInteger(resolvedDepositPct) ||
    (resolvedDepositPct as number) < 0 ||
    (resolvedDepositPct as number) > 100
  ) {
    return fail("depositPct must be an integer 0-100");
  }

  if (body.draftBlockId !== undefined && body.draftBlockId !== null) {
    if (typeof body.draftBlockId !== "string" || !UUID_RX.test(body.draftBlockId)) {
      return fail("draftBlockId must be a uuid");
    }
  }

  let offlinePaymentMethod: "cash" | "comp" | null = null;
  if (resolvedMode === "paid_offline") {
    const m = body.offlinePaymentMethod;
    if (!OFFLINE_METHODS.includes(m as (typeof OFFLINE_METHODS)[number])) {
      return fail("offlinePaymentMethod must be 'cash' or 'comp' when marking a block paid offline");
    }
    offlinePaymentMethod = m as "cash" | "comp";
  }

  return {
    ok: true,
    value: {
      locationId,
      brand: resolvedBrand as "soccerone" | "aspire",
      label: label.trim(),
      renterUserId: (body.renterUserId as string | undefined) ?? null,
      renterName: resolvedRenterName,
      renterEmail,
      renterPhone: optionalString(body.renterPhone),
      partySize: resolvedPartySize as number,
      purpose: optionalString(body.purpose),
      notes: optionalString(body.notes),
      pattern: pattern.value,
      excludedKeys,
      sessionOverrides: overrides.value,
      extraSessions: extraSessions.value,
      discount,
      depositPct: resolvedDepositPct as number,
      mode: resolvedMode as BlockCommitMode,
      offlinePaymentMethod,
      draftBlockId: (body.draftBlockId as string | undefined) ?? null,
    },
  };
}
