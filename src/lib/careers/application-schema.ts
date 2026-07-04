import { z } from "zod";

/**
 * Shared client/server validation for /careers applications. The API route
 * parses FormData through this; the React form mirrors it via
 * @hookform/resolvers. Keep in sync with the job_applications columns.
 */
export const APPLICATION_ROLES = ["referee", "coach", "staff"] as const;
export const APPLICATION_LOCATIONS = ["worthington", "downtown", "either"] as const;
export const APPLICATION_AVAILABILITY = ["weeknights", "weekends", "mornings"] as const;

export const jobApplicationSchema = z.object({
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
});

export type JobApplicationInput = z.infer<typeof jobApplicationSchema>;
