import { z } from "zod";

// Shared id-prefix patterns. Activity.ts has its own copy that predates this
// file; keep them in sync if you ever change a prefix.
export const ID_PATTERNS = {
  activity: /^act\.[a-z][a-z0-9_]*$/,
  role: /^role\.[a-z][a-z0-9_]*$/,
  feature: /^feat\.[a-z][a-z0-9_]*$/,
  checklist: /^chk\.[a-z][a-z0-9_]*$/,
  form: /^frm\.[a-z][a-z0-9_]*$/,
  signature: /^sig\.[a-z][a-z0-9_]*$/,
  counter: /^counter\.[a-z][a-z0-9_]*$/,
  event: /^evt\.[a-z][a-z0-9_]*$/,
} as const;

export const NonEmptyString = z.string().min(1);

export const RoleId = z.string().regex(ID_PATTERNS.role, "must match ^role\\.[a-z][a-z0-9_]*$");
