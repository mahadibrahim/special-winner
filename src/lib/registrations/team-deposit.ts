/**
 * Captain deposit for team registration — a flat $200 (locked decision).
 *
 * This constant is the AUTHORITATIVE source for the team-path deposit: the
 * team-create flow charges it, and marketing surfaces (catalog cards) that
 * advertise "Reserve a team · $200" import it from here. It is deliberately
 * independent of `seasons.deposit_cents`, which only governs the individual
 * deposit-checkout path.
 */
export const CAPTAIN_DEPOSIT_CENTS = 20000; // $200

/** Whole-dollar rendering of the captain deposit ("200"). */
export const CAPTAIN_DEPOSIT_DOLLARS = CAPTAIN_DEPOSIT_CENTS / 100;
