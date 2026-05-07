/**
 * Pure-function validators for the drop-in admin endpoints. Lives in
 * `src/lib/dropin/` so it stays testable without a DB connection. The
 * endpoints (rate-card, brand-profile) call these and translate the
 * returned error string into a 400 response.
 */

export interface RateCardPutBody {
  defaultSessionRateCents?: number;
  defaultMemberRateCents?: number;
  cancelWindowHours?: number;
  promotionWindowMinutes?: number;
}

export function validateRateCardPut(body: RateCardPutBody): string | null {
  for (const key of [
    "defaultSessionRateCents",
    "defaultMemberRateCents",
    "cancelWindowHours",
    "promotionWindowMinutes",
  ] as const) {
    const v = body[key];
    if (v === undefined) continue;
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
      return `${key} must be a non-negative number`;
    }
  }
  if (
    body.cancelWindowHours !== undefined &&
    body.cancelWindowHours > 24 * 30
  ) {
    return "cancelWindowHours unrealistic (>30 days)";
  }
  if (
    body.promotionWindowMinutes !== undefined &&
    (body.promotionWindowMinutes < 1 || body.promotionWindowMinutes > 24 * 60)
  ) {
    return "promotionWindowMinutes must be between 1 minute and 24 hours";
  }
  return null;
}

export interface BrandProfilePutBody {
  domain?: string;
  displayName?: string;
  logoMediaId?: string | null;
  heroCopy?: unknown;
  colorTokens?: unknown;
  footerCopy?: string | null;
  featuredVenueIds?: string[];
  active?: boolean;
}

const HEX_COLOR = /^#[0-9a-fA-F]{3,8}$/;
const DOMAIN_RX = /^[a-z0-9.-]+\.[a-z]{2,}$/i;

export function validateBrandProfilePut(body: BrandProfilePutBody): string | null {
  if (body.domain !== undefined) {
    if (typeof body.domain !== "string" || !DOMAIN_RX.test(body.domain.trim())) {
      return "domain must look like a hostname (example.com)";
    }
  }
  if (body.displayName !== undefined) {
    if (typeof body.displayName !== "string" || body.displayName.trim().length === 0) {
      return "displayName cannot be empty";
    }
  }
  if (body.featuredVenueIds !== undefined) {
    if (!Array.isArray(body.featuredVenueIds)) {
      return "featuredVenueIds must be an array of UUIDs";
    }
  }
  if (body.colorTokens !== undefined && body.colorTokens !== null) {
    if (typeof body.colorTokens !== "object" || Array.isArray(body.colorTokens)) {
      return "colorTokens must be an object";
    }
    for (const [k, v] of Object.entries(body.colorTokens as Record<string, unknown>)) {
      if (typeof v !== "string" || !HEX_COLOR.test(v)) {
        return `colorTokens.${k} must be a hex color (e.g. #ff8800)`;
      }
    }
  }
  return null;
}
