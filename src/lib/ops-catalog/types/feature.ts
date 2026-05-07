import { z } from "zod";
import { ID_PATTERNS, NonEmptyString } from "./common";

const PriorityEnum = z.enum(["P0", "P1", "P2", "P3"]);

const FeatureStatusEnum = z.enum(["stub", "in_progress", "shipped"]);

export const FeatureSchema = z.object({
  id: z.string().regex(ID_PATTERNS.feature, "must match ^feat\\.[a-z][a-z0-9_]*$"),
  name: NonEmptyString,
  description: NonEmptyString,
  priority: PriorityEnum,
  status: FeatureStatusEnum,
});

export type Feature = z.infer<typeof FeatureSchema>;
