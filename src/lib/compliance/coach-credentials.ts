/**
 * Coach compliance — pure functions only (no DB imports; unit-testable).
 *
 * The required set is a hardcoded constant per the Phase 1 spec
 * (docs/superpowers/plans/2026-07-06-coach-lifecycle-and-delivery-ops.md):
 * SafeSport + background check + CPR/first-aid + concussion protocol, per
 * docs/research/03-effective-coaching-practices.md. A `credential_requirements`
 * table is YAGNI until a second org wants a different set.
 */

export const REQUIRED_COACH_CREDENTIALS = [
  "safesport",
  "background_check",
  "cpr_first_aid",
  "concussion_protocol",
] as const;

export type RequiredCoachCredential =
  (typeof REQUIRED_COACH_CREDENTIALS)[number];

/** Valid credentials expiring within this many days get an amber warning. */
export const EXPIRING_SOON_DAYS = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Minimal shape needed to evaluate a credential row (structural — full
 *  `CoachCredential` rows from the schema satisfy it). */
export interface CredentialLike {
  credentialType?: string;
  status: "pending" | "valid" | "expired" | "rejected";
  expiresAt: Date | null;
}

export type EffectiveCredentialStatus =
  | "missing"
  | "pending"
  | "valid"
  | "expiring_soon"
  | "expired"
  | "rejected";

/**
 * Collapse stored status + expiry date into a single display/decision status.
 * The expiry date wins over a stale `valid` status — nobody updates rows the
 * day a cert lapses.
 */
export function effectiveCredentialStatus(
  cred: CredentialLike | null | undefined,
  now: Date,
): EffectiveCredentialStatus {
  if (!cred) return "missing";
  if (cred.status !== "valid") return cred.status;
  if (cred.expiresAt) {
    const remainingMs = cred.expiresAt.getTime() - now.getTime();
    if (remainingMs <= 0) return "expired";
    if (remainingMs <= EXPIRING_SOON_DAYS * DAY_MS) return "expiring_soon";
  }
  return "valid";
}

export interface CredentialGap {
  credentialType: RequiredCoachCredential;
  reason: "missing" | "pending" | "expired" | "rejected";
}

/**
 * Which of the REQUIRED credentials does this user lack?
 * `rowsForUser` is every credential row for one user (any type; non-required
 * types are ignored). `expiring_soon` is deliberately NOT a gap — the
 * credential is still valid today; the grid surfaces the amber warning.
 */
export function requiredCredentialGaps(
  rowsForUser: CredentialLike[],
  now: Date,
): CredentialGap[] {
  const byType = new Map(rowsForUser.map((r) => [r.credentialType, r]));
  const gaps: CredentialGap[] = [];
  for (const credentialType of REQUIRED_COACH_CREDENTIALS) {
    const eff = effectiveCredentialStatus(byType.get(credentialType), now);
    if (
      eff === "missing" ||
      eff === "pending" ||
      eff === "expired" ||
      eff === "rejected"
    ) {
      gaps.push({ credentialType, reason: eff });
    }
  }
  return gaps;
}
