import { z } from "zod";

export function dollarsToCents(d: number | null): number | null {
  return d == null ? null : Math.round(d * 100);
}
export function centsToDollars(c: number | null): number | null {
  return c == null ? null : c / 100;
}

const count = z.number().int().min(0);
// Known keys are typed; unknown keys are passed through (forward-compat).
export const benefitsSchema = z
  .object({
    rental_discount_pct: z.number().int().min(0).max(100).optional(),
    unlimited_pickup: z.boolean().optional(),
    free_pickup_per_month: count.optional(),
    guest_passes_per_month: count.optional(),
    booking_window_days: count.optional(),
    priority_league_signup_hrs: count.optional(),
    members_only_pickup: z.boolean().optional(),
    classes_per_month: count.optional(),
    unlimited_classes: z.boolean().optional(),
    camp_discount_pct: z.number().int().min(0).max(100).optional(),
  })
  .passthrough();

export const tierInputSchema = z
  .object({
    name: z.string().trim().min(1),
    monthlyDollars: z.number().positive().nullable(),
    annualDollars: z.number().positive().nullable(),
    benefits: benefitsSchema,
    displayOrder: z.number().int().default(0),
    isActive: z.boolean().default(true),
  })
  .refine((v) => v.monthlyDollars != null || v.annualDollars != null, {
    message: "At least one of monthly or annual price is required",
    path: ["monthlyDollars"],
  });

export type TierInput = z.infer<typeof tierInputSchema>;
