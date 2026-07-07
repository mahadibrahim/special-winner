import { z } from "zod";

/**
 * Shared zod validation for incident creation — consumed by both
 * POST /api/staff/incidents and the mobile capture form
 * (src/components/staff/incident-report-form.tsx), so the two never drift.
 *
 * The `subject` field is a discriminated union: a `participant` (a
 * registered family_member — the id gets tenant-verified server-side via
 * requireSameOrgFamilyMember) or a free-text bystander/staff/other. This
 * matches the incidents.incidents_subject_shape DB CHECK constraint.
 */

const participantSubjectSchema = z.object({
  subjectType: z.literal("participant"),
  familyMemberId: z.string().uuid("familyMemberId must be a valid UUID"),
});

const bystanderSubjectSchema = z.object({
  subjectType: z.literal("bystander"),
  freeTextName: z.string().min(1, "freeTextName is required"),
});

const staffSubjectSchema = z.object({
  subjectType: z.literal("staff"),
  freeTextName: z.string().min(1, "freeTextName is required"),
});

const otherSubjectSchema = z.object({
  subjectType: z.literal("other"),
  freeTextName: z.string().min(1, "freeTextName is required"),
});

export const incidentSubjectSchema = z.discriminatedUnion("subjectType", [
  participantSubjectSchema,
  bystanderSubjectSchema,
  staffSubjectSchema,
  otherSubjectSchema,
]);

export type IncidentSubjectInput = z.infer<typeof incidentSubjectSchema>;

export const incidentTypeValues = [
  "injury",
  "altercation",
  "medical_event",
  "property_damage",
  "other",
] as const;

export const createIncidentSchema = z.object({
  venueId: z.string().uuid("venueId must be a valid UUID"),
  // Optional: an incident isn't always tied to a scheduled game (e.g. open
  // gym/pickup). When present, submission auto-completes that game's
  // act.incident_response activity_completions row.
  gameId: z.string().uuid("gameId must be a valid UUID").optional().nullable(),
  subject: incidentSubjectSchema,
  incidentType: z.enum(incidentTypeValues),
  occurredAt: z.string().datetime({ message: "occurredAt must be an ISO datetime string" }),
  peopleInvolved: z.string().min(1, "peopleInvolved is required"),
  firstResponderName: z.string().min(1, "firstResponderName is required"),
  immediateCareGiven: z.string().min(1, "immediateCareGiven is required"),
  emergencyServicesCalled: z.boolean(),
  emergencyServicesCallTime: z
    .string()
    .datetime({ message: "emergencyServicesCallTime must be an ISO datetime string" })
    .optional()
    .nullable(),
  suspectedConcussion: z.boolean(),
  removedFromPlay: z.boolean().optional().nullable(),
  parentNotifiedOnsite: z.boolean(),
});

export type CreateIncidentInput = z.infer<typeof createIncidentSchema>;
