import { z } from "zod";
import { ID_PATTERNS, NonEmptyString } from "./common";

const RoleTierEnum = z.enum([
  "leadership",
  "operational",
  "field_side",
  "customer",
  "system",
]);

const RoleKindEnum = z.enum(["worker", "customer", "system"]);

const ManualTargetEnum = z.enum([
  "employee_manual",
  "contractor_handbook",
  "hand_authored",
  "none",
]);

export const RoleSchema = z.object({
  id: z.string().regex(ID_PATTERNS.role, "must match ^role\\.[a-z][a-z0-9_]*$"),
  name: NonEmptyString,
  tier: RoleTierEnum,
  kind: RoleKindEnum,
  description: NonEmptyString,
  manual_target: ManualTargetEnum,
});

export type Role = z.infer<typeof RoleSchema>;
