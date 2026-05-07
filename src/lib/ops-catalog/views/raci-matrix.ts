// RACI matrix CSV — one row per activity, one column per role. Cell encodes
// the strongest RACI relationship the role has with the activity:
//   A = accountable, R = responsible, C = consulted, I = informed, "" = none.
// A is dominant; if a role appears in both accountable and responsible, the
// cell is "A".
//
// Ad-hoc view: this is for a human (or a spreadsheet) to skim, not the
// platform. Roles are sorted alphabetically so the column order is stable.

import type { Catalog } from "../loader";
import type { Activity } from "../types/activity";

type RaciCode = "A" | "R" | "C" | "I" | "";

function raciFor(activity: Activity, roleId: string): RaciCode {
  if (activity.raci.accountable === roleId) return "A";
  if (activity.raci.responsible.includes(roleId)) return "R";
  if (activity.raci.consulted.includes(roleId)) return "C";
  if (activity.raci.informed.includes(roleId)) return "I";
  return "";
}

export function renderRaciMatrix(catalog: Catalog): string {
  const roleIds = catalog.roles.map((r) => r.id).sort();
  const headerCols = ["activity_id", "phase", ...roleIds];
  const lines: string[] = [headerCols.join(",")];

  for (const activity of catalog.activities) {
    const cells = roleIds.map((rid) => raciFor(activity, rid));
    lines.push([activity.id, activity.phase, ...cells].join(","));
  }

  return lines.join("\n") + "\n";
}
