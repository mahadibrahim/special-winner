import { z } from "zod";
import { ID_PATTERNS, NonEmptyString, RoleId } from "./common";

const ArtifactStatusEnum = z.enum(["stub", "implemented", "deprecated"]);

const ChecklistItemSchema = z.object({
  id: NonEmptyString,
  label: NonEmptyString,
});

const FormFieldTypeEnum = z.enum([
  "text",
  "long_text",
  "enum",
  "boolean",
  "number",
  "date",
]);

const FormFieldSchema = z.object({
  id: NonEmptyString,
  label: NonEmptyString,
  type: FormFieldTypeEnum,
  options: z.array(z.string()).optional(),
  required: z.boolean().default(false),
});

const ChecklistTemplateSchema = z.object({
  id: z.string().regex(ID_PATTERNS.checklist, "must match ^chk\\.[a-z][a-z0-9_]*$"),
  kind: z.literal("checklist"),
  status: ArtifactStatusEnum,
  items: z.array(ChecklistItemSchema).min(1, "checklist must have at least one item"),
});

const FormTemplateSchema = z.object({
  id: z.string().regex(ID_PATTERNS.form, "must match ^frm\\.[a-z][a-z0-9_]*$"),
  kind: z.literal("form"),
  status: ArtifactStatusEnum,
  fields: z.array(FormFieldSchema).min(1, "form must have at least one field"),
});

const SignatureTemplateSchema = z.object({
  id: z.string().regex(ID_PATTERNS.signature, "must match ^sig\\.[a-z][a-z0-9_]*$"),
  kind: z.literal("signature"),
  status: ArtifactStatusEnum,
  required_role: RoleId,
  prompt: NonEmptyString,
});

const SystemEventTemplateSchema = z.object({
  id: z.string().regex(ID_PATTERNS.event, "must match ^evt\\.[a-z][a-z0-9_]*$"),
  kind: z.literal("system_event"),
  status: ArtifactStatusEnum,
  description: NonEmptyString,
});

const CounterTemplateSchema = z.object({
  id: z.string().regex(ID_PATTERNS.counter, "must match ^counter\\.[a-z][a-z0-9_]*$"),
  kind: z.literal("counter"),
  status: ArtifactStatusEnum,
  description: NonEmptyString,
});

export const ArtifactTemplateSchema = z.discriminatedUnion("kind", [
  ChecklistTemplateSchema,
  FormTemplateSchema,
  SignatureTemplateSchema,
  SystemEventTemplateSchema,
  CounterTemplateSchema,
]);

export type ArtifactTemplate = z.infer<typeof ArtifactTemplateSchema>;
