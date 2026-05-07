// Role manual view — renders the activities a given role owns or supports,
// grouped by phase, as a markdown manual. Worker roles only for the bulk
// generator; customer + system roles are excluded.

import type { Catalog } from "../loader";
import type { Activity } from "../types/activity";

const PHASE_ORDER: Activity["phase"][] = [
  "pre_day",
  "day_setup",
  "pre_game",
  "in_game",
  "post_game",
  "end_of_day",
  "post_day",
];

type Involvement = "Accountable" | "Responsible" | "Accountable | Responsible";

function involvementOf(activity: Activity, roleId: string): Involvement | null {
  const isAccountable = activity.raci.accountable === roleId;
  const isResponsible = activity.raci.responsible.includes(roleId);
  if (isAccountable && isResponsible) return "Accountable | Responsible";
  if (isAccountable) return "Accountable";
  if (isResponsible) return "Responsible";
  return null;
}

function renderActivity(activity: Activity, involvement: Involvement): string {
  const lines: string[] = [];
  lines.push(`### ${activity.name} (\`${activity.id}\`) — ${involvement}`);
  lines.push("");
  lines.push(`- Trigger: ${activity.trigger}`);
  lines.push(`- Expected completion: ${activity.expected_completion}`);
  lines.push(`- Tracking: ${activity.tracking_method}`);
  lines.push(`- Escalation: ${activity.escalation_path.trim()}`);
  lines.push("");
  lines.push(activity.sop_body.trimEnd());
  return lines.join("\n");
}

export function renderRoleManual(catalog: Catalog, roleId: string): string {
  const role = catalog.roles.find((r) => r.id === roleId);
  if (!role) {
    throw new Error(`Unknown role "${roleId}"`);
  }

  const matched: Array<{ activity: Activity; involvement: Involvement }> = [];
  for (const activity of catalog.activities) {
    const involvement = involvementOf(activity, roleId);
    if (involvement) matched.push({ activity, involvement });
  }

  const sections: string[] = [];
  sections.push(`# ${role.name}`);
  sections.push("");
  sections.push(role.description.trim());

  for (const phase of PHASE_ORDER) {
    const phaseEntries = matched.filter((m) => m.activity.phase === phase);
    if (phaseEntries.length === 0) continue;
    sections.push("");
    sections.push(`## ${phase}`);
    for (const { activity, involvement } of phaseEntries) {
      sections.push("");
      sections.push(renderActivity(activity, involvement));
    }
  }

  return sections.join("\n") + "\n";
}

export function generateAllRoleManuals(catalog: Catalog): Record<string, string> {
  const out: Record<string, string> = {};
  for (const role of catalog.roles) {
    if (role.kind !== "worker") continue;
    out[role.id] = renderRoleManual(catalog, role.id);
  }
  return out;
}
