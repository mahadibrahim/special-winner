/**
 * Handoff logic — decides which role should own the activity at a given
 * escalation stage.
 *
 *   pre_reminder      → no handoff (responsibility unchanged)
 *   overdue_alert     → activity.raci.accountable (the canonical owner)
 *   escalation        → role parsed out of activity.escalation_path
 *                       (falls back to role.venue_manager when the
 *                        text doesn't mention a `role.<id>`)
 *   final_escalation  → role.director (always — the buck stops here)
 *
 * The escalation_path field is free-form prose authored in the YAML
 * catalog. We extract the role token by regex rather than requiring a
 * structured shape, because the prose serves double duty as
 * documentation for human runbook readers.
 */
import type { Stage } from "./stage";

const ROLE_ID_REGEX = /role\.[a-z][a-z0-9_]*/;

export function parseEscalationTarget(text: string): string | null {
  const match = text.match(ROLE_ID_REGEX);
  return match ? match[0] : null;
}

export interface ActivityHandoffShape {
  raci: { accountable: string };
  escalation_path: string;
}

export function computeHandoffTarget(
  activity: ActivityHandoffShape,
  stage: Stage,
): string | null {
  if (stage === "pre_reminder") return null;
  if (stage === "overdue_alert") return activity.raci.accountable;
  if (stage === "escalation") {
    return parseEscalationTarget(activity.escalation_path) ?? "role.venue_manager";
  }
  if (stage === "final_escalation") return "role.director";
  return null;
}
