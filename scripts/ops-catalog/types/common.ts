import { z } from "zod";

// Shared id-prefix patterns. Activity.ts has its own copy that predates this
// file; keep them in sync if you ever change a prefix.
export const ID_PATTERNS = {
  activity: /^act\.[a-z_]+$/,
  role: /^role\.[a-z_]+$/,
  feature: /^feat\.[a-z_]+$/,
  checklist: /^chk\.[a-z_]+$/,
  form: /^frm\.[a-z_]+$/,
  signature: /^sig\.[a-z_]+$/,
  counter: /^counter\.[a-z_]+$/,
  event: /^evt\.[a-z_]+$/,
} as const;

export const NonEmptyString = z.string().min(1);

export const RoleId = z.string().regex(ID_PATTERNS.role, "must match ^role\\.[a-z_]+$");
