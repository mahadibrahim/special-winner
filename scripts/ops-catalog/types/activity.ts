import { z } from "zod";

const ID_PATTERNS = {
  activity: /^act\.[a-z][a-z0-9_]*$/,
  role: /^role\.[a-z][a-z0-9_]*$/,
  feature: /^feat\.[a-z][a-z0-9_]*$/,
  checklist: /^chk\.[a-z][a-z0-9_]*$/,
  form: /^frm\.[a-z][a-z0-9_]*$/,
  signature: /^sig\.[a-z][a-z0-9_]*$/,
  counter: /^counter\.[a-z][a-z0-9_]*$/,
  event: /^evt\.[a-z][a-z0-9_]*$/,
} as const;

const RoleId = z.string().regex(ID_PATTERNS.role, "must match ^role\\.[a-z][a-z0-9_]*$");
const FeatureId = z.string().regex(ID_PATTERNS.feature, "must match ^feat\\.[a-z][a-z0-9_]*$");

const PhaseEnum = z.enum([
  "pre_day",
  "day_setup",
  "pre_game",
  "in_game",
  "post_game",
  "end_of_day",
  "post_day",
]);

const AutomationStatusEnum = z.enum(["platform", "hybrid", "manual"]);

const AudienceTagEnum = z.enum(["youth", "adult", "mixed"]);

const TrackingMethodEnum = z.enum([
  "checklist",
  "form",
  "signature",
  "photo_upload",
  "system_event",
  "counter_increment",
  "external_acknowledgment",
]);

// Tracking-artifact shapes. Each is keyed implicitly by the surrounding
// `tracking_method`; the cross-field check happens in superRefine on the outer
// schema. We intentionally use plain objects (not a discriminated union with a
// synthetic key) because the YAML-authored shape has no discriminator field.
const ChecklistArtifact = z.object({
  template_id: z.string().regex(ID_PATTERNS.checklist, "must match ^chk\\.[a-z][a-z0-9_]*$"),
});

const FormArtifact = z.object({
  template_id: z.string().regex(ID_PATTERNS.form, "must match ^frm\\.[a-z][a-z0-9_]*$"),
});

const SignatureArtifact = z.object({
  template_id: z.string().regex(ID_PATTERNS.signature, "must match ^sig\\.[a-z][a-z0-9_]*$"),
  required_role: RoleId,
});

const PhotoUploadArtifact = z.object({
  media_kind: z.string().min(1),
  min_count: z.number().int().min(1),
});

const CounterIncrementArtifact = z.object({
  counter: z.string().regex(ID_PATTERNS.counter, "must match ^counter\\.[a-z][a-z0-9_]*$"),
  min_count: z.number().int().min(0),
});

const SystemEventArtifact = z.object({
  event_type: z.string().regex(ID_PATTERNS.event, "must match ^evt\\.[a-z][a-z0-9_]*$"),
});

const ExternalAcknowledgmentArtifact = z.object({
  external_system: z.enum(["stripe", "telegram", "resend", "quo", "payroll"]),
  record_kind: z.string().min(1),
});

const ARTIFACT_BY_METHOD = {
  checklist: ChecklistArtifact,
  form: FormArtifact,
  signature: SignatureArtifact,
  photo_upload: PhotoUploadArtifact,
  counter_increment: CounterIncrementArtifact,
  system_event: SystemEventArtifact,
  external_acknowledgment: ExternalAcknowledgmentArtifact,
} as const;

const RaciSchema = z.object({
  accountable: RoleId,
  responsible: z.array(RoleId).min(1, "responsible must have at least one role"),
  consulted: z.array(RoleId).default([]),
  informed: z.array(RoleId).default([]),
});

const ReminderPolicySchema = z
  .object({
    pre_reminder_minutes: z.number().int().min(0).optional(),
    overdue_alert_minutes: z.number().int().min(0).optional(),
    escalation_minutes: z.number().int().min(0).optional(),
  })
  .optional();

const NonEmptyString = z.string().min(1);

export const ActivitySchema = z
  .object({
    id: z.string().regex(ID_PATTERNS.activity, "must match ^act\\.[a-z][a-z0-9_]*$"),
    name: NonEmptyString,
    description: NonEmptyString,
    trigger: NonEmptyString,
    phase: PhaseEnum,
    sport_tags: z.array(z.string()).default([]),
    venue_tags: z.array(z.string()).default([]),
    format_tags: z.array(z.string()).default([]),
    audience_tags: z.array(AudienceTagEnum).default([]),
    raci: RaciSchema,
    automation_status: AutomationStatusEnum,
    platform_features: z.array(FeatureId).default([]),
    escalation_path: NonEmptyString,
    sop_body: NonEmptyString,
    tracking_method: TrackingMethodEnum,
    // Validated cross-field below in superRefine.
    tracking_artifact: z.record(z.string(), z.unknown()),
    expected_completion: NonEmptyString,
    reminder_policy: ReminderPolicySchema,
  })
  .superRefine((value, ctx) => {
    const method = value.tracking_method as keyof typeof ARTIFACT_BY_METHOD;
    const artifactSchema = ARTIFACT_BY_METHOD[method];
    if (!artifactSchema) {
      // tracking_method enum already rejected this; nothing more to do.
      return;
    }
    const result = artifactSchema.safeParse(value.tracking_artifact);
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          code: "custom",
          path: ["tracking_artifact", ...issue.path],
          message: `tracking_artifact for "${method}": ${issue.message}`,
        });
      }
    }
  });

export type Activity = z.infer<typeof ActivitySchema>;
