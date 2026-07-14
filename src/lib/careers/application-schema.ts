import { z } from "zod";

/**
 * Shared client/server validation for /careers applications. The API route
 * parses FormData through this; the React form mirrors it via
 * @hookform/resolvers. Keep in sync with the job_applications columns.
 */
export const APPLICATION_ROLES = ["referee", "coach", "staff", "host"] as const;
export const APPLICATION_LOCATIONS = ["worthington", "downtown", "either"] as const;
export const APPLICATION_AVAILABILITY = ["weeknights", "weekends", "mornings"] as const;
export const APPLICATION_GAMES_PLAYED = ["0", "1-3", "3-5", "5+"] as const;

/**
 * Server-issued R2 keys handed back by the form — never client-invented
 * paths. The https URL arm is the no-R2 degrade path (spec: when R2 env is
 * absent, upload fields become link inputs — YouTube/Loom/Drive links).
 */
const hostMediaKey = z.union([
  z.string().regex(/^careers\/hosts\/[A-Za-z0-9._-]+$/, "Invalid upload reference"),
  z.string().url().startsWith("https://").max(500),
]);

export const jobApplicationSchema = z
  .object({
    role: z.enum(APPLICATION_ROLES),
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().min(1).max(100),
    email: z.string().trim().toLowerCase().email().max(320),
    phone: z.string().trim().max(30).optional(),
    preferredLocation: z.enum(APPLICATION_LOCATIONS).optional(),
    certifications: z.string().trim().max(2000).optional(),
    experience: z.string().trim().min(1).max(5000),
    availability: z.array(z.enum(APPLICATION_AVAILABILITY)).max(3).default([]),
    source: z.string().trim().max(200).optional(),
    // Host-only (validated required for role === "host" below)
    dateOfBirth: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
      .optional(),
    gamesPlayed: z.enum(APPLICATION_GAMES_PLAYED).optional(),
    weeklyCommitment: z.enum(["yes", "no"]).optional(),
    photoKey: hostMediaKey.optional(),
    motivationVideoKey: hostMediaKey.optional(),
    demoVideoKey: hostMediaKey.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role !== "host") return;
    const required: Array<keyof typeof data> = [
      "phone",
      "dateOfBirth",
      "gamesPlayed",
      "weeklyCommitment",
      "photoKey",
      "motivationVideoKey",
      "demoVideoKey",
    ];
    for (const field of required) {
      if (!data[field]) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field],
          message: "Required for host applications",
        });
      }
    }
  });

export type JobApplicationInput = z.infer<typeof jobApplicationSchema>;
