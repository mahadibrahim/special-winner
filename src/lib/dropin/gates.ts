/**
 * Drop-in capacity / eligibility gates.
 *
 * Each gate is a pure function returning either { ok: true } or
 * { ok: false, reason }. The booking orchestrator runs all relevant gates
 * inside the same DB transaction and short-circuits on the first failure.
 *
 * Why pure functions and not DB queries here: the orchestrator already
 * holds the session row + counts under FOR UPDATE; the gates just
 * interpret those numbers. This keeps the rules trivially testable without
 * spinning up a DB.
 */

export type GateResult =
  | { ok: true }
  | { ok: false; reason: "members_only" | "session_full" | "gender_cap_full" };

/**
 * If the session is members-only, require an active membership.
 */
export function checkMembersOnly(
  session: { membersOnly: boolean },
  membership: { id: string } | null,
): GateResult {
  if (!session.membersOnly) return { ok: true };
  if (membership) return { ok: true };
  return { ok: false, reason: "members_only" };
}

/**
 * Block when the session is at or over its overall capacity.
 *
 * `confirmedCount` should include only confirmed bookings (not waitlisted
 * or pending_claim) — those don't consume seats.
 */
export function checkCapacity(
  session: { capacity: number },
  confirmedCount: number,
): GateResult {
  return confirmedCount < session.capacity
    ? { ok: true }
    : { ok: false, reason: "session_full" };
}

/**
 * Enforce per-gender sub-caps when configured.
 *
 * Both `capacityMale` and `capacityFemale` must be set together (DB CHECK
 * enforces this); if either is null, the gate is a no-op. Non-binary and
 * prefer-not-to-say users bypass the gender sub-cap and only rely on the
 * overall capacity gate.
 */
export function checkGenderCap(
  session: { capacityMale: number | null; capacityFemale: number | null },
  userGender: "male" | "female" | "non_binary" | "prefer_not_to_say",
  countsByGender: { male: number; female: number },
): GateResult {
  // No gender constraint configured.
  if (session.capacityMale === null || session.capacityFemale === null) {
    return { ok: true };
  }
  // Non-binary or prefer-not-to-say bypass the gender sub-cap.
  if (userGender === "non_binary" || userGender === "prefer_not_to_say") {
    return { ok: true };
  }
  if (userGender === "male" && countsByGender.male >= session.capacityMale) {
    return { ok: false, reason: "gender_cap_full" };
  }
  if (userGender === "female" && countsByGender.female >= session.capacityFemale) {
    return { ok: false, reason: "gender_cap_full" };
  }
  return { ok: true };
}
