import { z } from "zod";

/**
 * Shared zod validation for POST /api/referee/matches/[gameId]/ejections
 * (product-backlog build #4 — ejection/suspension tracker). Ejections are
 * created via this additive-only endpoint, never the delete-all-reinsert
 * bulk `incidents` array on /report — see report.ts and
 * docs/superpowers/plans/2026-07-07-ejection-tracker.md.
 *
 * `gamesMissed` defaults to 1 (owner rule: one game per single ejection)
 * when `carriesSuspension` is true and the field is omitted — that default
 * is applied by the endpoint, not this schema, since it's conditional on
 * another field's value rather than a fixed default.
 */
export const ejectionSchema = z.object({
  side: z.enum(["home", "away"]),
  player: z
    .string()
    .min(1, "player is required")
    .max(120, "player must be 120 characters or fewer"),
  minute: z.number().int("minute must be an integer").min(0, "minute must be non-negative").nullish(),
  reason: z.string().min(1, "reason is required"),
  carriesSuspension: z.boolean(),
  gamesMissed: z
    .number()
    .int("gamesMissed must be an integer")
    .min(0, "gamesMissed must be non-negative")
    .nullish(),
  suspensionNotes: z.string().nullish(),
  escalatedToDirector: z.boolean().default(false),
});

export type EjectionInput = z.infer<typeof ejectionSchema>;
