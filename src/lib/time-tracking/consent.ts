/**
 * Location-tracking consent — the mandatory, versioned employment-condition
 * acknowledgement gating the first clock-in (owner decision #1, 2026-07-07,
 * docs/superpowers/plans/2026-07-07-time-tracking.md: "geolocation is NOT
 * optional for employees; it is a condition of employment"). No ack, no
 * clock-in — see the 409 `consent_required` gate in
 * src/pages/api/staff/shifts/clock-in.ts and
 * src/pages/api/referee/matches/[gameId]/check-in.ts.
 *
 * `staffLocationConsents` is keyed on (userId, organizationId) regardless of
 * labor role — coaches, venue managers, and referees all clock in/check in
 * with location capture, so they all go through the same table and the same
 * notice. Bumping CURRENT_LOCATION_CONSENT_VERSION invalidates every prior
 * acknowledgement at once (a fresh row is required for the new version).
 */
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { staffLocationConsents } from "@/lib/db/schema/time-tracking";

export const CURRENT_LOCATION_CONSENT_VERSION = "2026-07-07-employment-condition-v1";

export const LOCATION_CONSENT_NOTICE_TITLE =
  "Location capture is a condition of employment";

export const LOCATION_CONSENT_NOTICE_BODY =
  "To clock in or out (or check in to a match), this app captures your " +
  "device's location and compares it against the venue. This is not " +
  "optional — accurate location capture at clock-in/out is a condition of " +
  "your employment or assignment here. If you decline, you won't be able " +
  "to clock in. Your location is only captured at the moment you tap " +
  "clock in / clock out / check in — it is never tracked continuously.";

export interface LocationConsentStatus {
  acknowledged: boolean;
  noticeVersion: string | null;
  acknowledgedAt: Date | null;
}

/**
 * Current consent status for (userId, organizationId). `acknowledged` is
 * true only when the stored row's noticeVersion matches the CURRENT
 * version — an acknowledgement of an older version doesn't count.
 */
export async function getLocationConsentStatus(
  userId: string,
  organizationId: string,
): Promise<LocationConsentStatus> {
  const [row] = await getDb()
    .select({
      noticeVersion: staffLocationConsents.noticeVersion,
      acknowledgedAt: staffLocationConsents.acknowledgedAt,
    })
    .from(staffLocationConsents)
    .where(
      and(
        eq(staffLocationConsents.userId, userId),
        eq(staffLocationConsents.organizationId, organizationId),
      ),
    )
    .limit(1);

  if (!row) {
    return { acknowledged: false, noticeVersion: null, acknowledgedAt: null };
  }

  return {
    acknowledged: row.noticeVersion === CURRENT_LOCATION_CONSENT_VERSION,
    noticeVersion: row.noticeVersion,
    acknowledgedAt: row.acknowledgedAt,
  };
}

/** Thin convenience wrapper for the clock-in/check-in 409 gate. */
export async function hasCurrentLocationConsent(
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const status = await getLocationConsentStatus(userId, organizationId);
  return status.acknowledged;
}

/**
 * Upsert the acknowledgement for (userId, organizationId) to the CURRENT
 * notice version. Idempotent — re-acknowledging the same version just
 * bumps acknowledgedAt/updatedAt on the existing row.
 */
export async function acknowledgeLocationConsent(
  userId: string,
  organizationId: string,
): Promise<LocationConsentStatus> {
  const now = new Date();
  const [row] = await getDb()
    .insert(staffLocationConsents)
    .values({
      userId,
      organizationId,
      noticeVersion: CURRENT_LOCATION_CONSENT_VERSION,
      acknowledgedAt: now,
    })
    .onConflictDoUpdate({
      target: [staffLocationConsents.userId, staffLocationConsents.organizationId],
      set: {
        noticeVersion: CURRENT_LOCATION_CONSENT_VERSION,
        acknowledgedAt: now,
        updatedAt: now,
      },
    })
    .returning({
      noticeVersion: staffLocationConsents.noticeVersion,
      acknowledgedAt: staffLocationConsents.acknowledgedAt,
    });

  return {
    acknowledged: true,
    noticeVersion: row.noticeVersion,
    acknowledgedAt: row.acknowledgedAt,
  };
}
