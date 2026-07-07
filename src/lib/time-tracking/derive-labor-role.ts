/**
 * Derive the labor role a user clocks in as for the generic staff shift
 * flow (POST /api/staff/shifts/clock-in, Task 8 — decision-dependent,
 * not built in this foundation pass).
 *
 * Referees are intentionally excluded here — they clock in per-match via
 * a separate endpoint (POST /api/referee/matches/[gameId]/check-in, Task
 * 12) where the "referee" labor role is implicit from that surface, not
 * derived from the user's role assignments.
 *
 * Precedence (highest first): `location_admin` outranks `coach` — a user
 * holding both role assignments (e.g. an owner-operator who also coaches)
 * clocks in as the venue_manager, since that's the higher-authority role
 * for the shift. A user holding neither role assignment cannot use the
 * generic staff shift flow at all (callers should treat `null` as a 403).
 */
import type { LaborRole } from "@/lib/db/schema/time-tracking";

/** The generic staff shift flow only ever derives these two — never `referee`. */
export type StaffShiftLaborRole = Extract<LaborRole, "coach" | "venue_manager">;

export function deriveLaborRole(
  roleNames: readonly string[],
): StaffShiftLaborRole | null {
  if (roleNames.includes("location_admin")) return "venue_manager";
  if (roleNames.includes("coach")) return "coach";
  return null;
}
