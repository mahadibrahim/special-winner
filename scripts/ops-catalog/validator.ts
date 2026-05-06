import type { Catalog } from "./loader";
import type { Activity } from "./types/activity";
import type { ArtifactTemplate } from "./types/artifact-template";

export interface ValidationIssue {
  level: "error" | "warning";
  source: string;
  message: string;
}

export interface ValidationResult {
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

function findDuplicates<T extends { id: string }>(
  items: T[],
  kind: string,
): ValidationIssue[] {
  const seen = new Set<string>();
  const dupIssues: ValidationIssue[] = [];
  const reported = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id) && !reported.has(item.id)) {
      reported.add(item.id);
      dupIssues.push({
        level: "error",
        source: item.id,
        message: `duplicate id "${item.id}" in ${kind}`,
      });
    }
    seen.add(item.id);
  }
  return dupIssues;
}

type ArtifactKind = ArtifactTemplate["kind"];

function checkActivityRefs(
  activity: Activity,
  roleIds: Set<string>,
  featureIds: Set<string>,
  artifactsById: Map<string, ArtifactTemplate>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const src = activity.id;

  // RACI role refs
  const roleRefs: Array<[string, string]> = [
    ["raci.accountable", activity.raci.accountable],
    ...activity.raci.responsible.map<[string, string]>((r) => ["raci.responsible", r]),
    ...activity.raci.consulted.map<[string, string]>((r) => ["raci.consulted", r]),
    ...activity.raci.informed.map<[string, string]>((r) => ["raci.informed", r]),
  ];
  for (const [field, roleId] of roleRefs) {
    if (!roleIds.has(roleId)) {
      issues.push({
        level: "error",
        source: src,
        message: `${field} references unknown role "${roleId}"`,
      });
    }
  }

  // Platform feature refs
  for (const featId of activity.platform_features) {
    if (!featureIds.has(featId)) {
      issues.push({
        level: "error",
        source: src,
        message: `platform_features references unknown feature "${featId}"`,
      });
    }
  }

  // Tracking artifact refs
  const ta = activity.tracking_artifact as Record<string, unknown>;
  const method = activity.tracking_method;

  function checkArtifactRef(refId: string, expectedKind: ArtifactKind, label: string) {
    const found = artifactsById.get(refId);
    if (!found) {
      issues.push({
        level: "error",
        source: src,
        message: `tracking_artifact.${label} references unknown artifact "${refId}"`,
      });
    } else if (found.kind !== expectedKind) {
      issues.push({
        level: "error",
        source: src,
        message: `tracking_artifact.${label} "${refId}" has kind "${found.kind}", expected "${expectedKind}"`,
      });
    }
  }

  if (method === "checklist" || method === "form" || method === "signature") {
    const templateId = typeof ta.template_id === "string" ? ta.template_id : undefined;
    if (templateId) {
      checkArtifactRef(templateId, method, "template_id");
    }
  } else if (method === "system_event") {
    const eventType = typeof ta.event_type === "string" ? ta.event_type : undefined;
    if (eventType) {
      checkArtifactRef(eventType, "system_event", "event_type");
    }
  } else if (method === "counter_increment") {
    const counter = typeof ta.counter === "string" ? ta.counter : undefined;
    if (counter) {
      checkArtifactRef(counter, "counter", "counter");
    }
  }

  return issues;
}

function checkSmellFlags(activity: Activity): ValidationIssue[] {
  const warnings: ValidationIssue[] = [];
  if (
    activity.raci.accountable === "role.director" &&
    activity.phase !== "post_day"
  ) {
    warnings.push({
      level: "warning",
      source: activity.id,
      message: `accountable=role.director outside post_day phase (phase="${activity.phase}") — director should typically not be the day-of accountable`,
    });
  }
  return warnings;
}

export function validateCatalog(catalog: Catalog): ValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  // Duplicate id checks per-kind
  errors.push(...findDuplicates(catalog.roles, "roles"));
  errors.push(...findDuplicates(catalog.features, "features"));
  errors.push(...findDuplicates(catalog.artifacts, "artifacts"));
  errors.push(...findDuplicates(catalog.activities, "activities"));

  const roleIds = new Set(catalog.roles.map((r) => r.id));
  const featureIds = new Set(catalog.features.map((f) => f.id));
  const artifactsById = new Map(catalog.artifacts.map((a) => [a.id, a]));

  for (const activity of catalog.activities) {
    errors.push(...checkActivityRefs(activity, roleIds, featureIds, artifactsById));
    warnings.push(...checkSmellFlags(activity));
  }

  return { errors, warnings };
}
