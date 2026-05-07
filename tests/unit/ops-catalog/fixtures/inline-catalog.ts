// Reusable in-memory catalog fixture for view-generator tests.
//
// Shape matches the schemas in scripts/ops-catalog/types/. Kept small and
// hand-built so tests can pin precise expectations against output strings.

import type { Catalog } from "../../../../src/lib/ops-catalog/loader";
import type { Activity } from "../../../../src/lib/ops-catalog/types/activity";
import type { ArtifactTemplate } from "../../../../src/lib/ops-catalog/types/artifact-template";
import type { Feature } from "../../../../src/lib/ops-catalog/types/feature";
import type { Role } from "../../../../src/lib/ops-catalog/types/role";

const roleVenueManager: Role = {
  id: "role.venue_manager",
  name: "Venue Manager",
  tier: "operational",
  kind: "worker",
  description: "Day-of operational lead at the venue.",
  manual_target: "employee_manual",
};

const roleCoach: Role = {
  id: "role.coach",
  name: "Coach",
  tier: "field_side",
  kind: "worker",
  description: "Runs the bench and the team during play.",
  manual_target: "contractor_handbook",
};

const roleParent: Role = {
  id: "role.parent",
  name: "Parent",
  tier: "customer",
  kind: "customer",
  description: "Registered parent or guardian.",
  manual_target: "none",
};

const featAlertDash: Feature = {
  id: "feat.weather_alert_dashboard",
  name: "Weather alert dashboard",
  description: "Surfaces forecasted hazards to the venue manager.",
  priority: "P1",
  status: "stub",
};

const featCancelBroadcast: Feature = {
  id: "feat.cancellation_broadcast",
  name: "Cancellation broadcast",
  description: "Fans out cancellations to affected rosters.",
  priority: "P0",
  status: "in_progress",
};

const artifactRainoutForm: ArtifactTemplate = {
  id: "frm.rainout_decision",
  kind: "form",
  status: "stub",
  fields: [
    { id: "decision", label: "Go / No-go", type: "enum", options: ["go", "no_go"], required: true },
  ],
};

const artifactSetupChecklist: ArtifactTemplate = {
  id: "chk.field_setup",
  kind: "checklist",
  status: "stub",
  items: [{ id: "cones", label: "Cones placed" }],
};

// Activity 1 — pre_game, outdoor, soccer, hybrid (references both features).
const actRainout: Activity = {
  id: "act.rainout_decision",
  name: "Rainout decision",
  description: "Make go/no-go call when weather threatens a match",
  trigger: "Weather/field condition within 2h of kickoff suggests cancellation",
  phase: "pre_game",
  sport_tags: ["soccer"],
  venue_tags: ["outdoor"],
  format_tags: [],
  audience_tags: ["youth"],
  raci: {
    accountable: "role.venue_manager",
    responsible: ["role.venue_manager"],
    consulted: [],
    informed: ["role.coach", "role.parent"],
  },
  automation_status: "hybrid",
  platform_features: ["feat.weather_alert_dashboard", "feat.cancellation_broadcast"],
  escalation_path: "If Venue Manager unreachable, on-call Director makes call.",
  sop_body: "1. Open admin panel.\n2. Check weather.\n3. Decide.",
  tracking_method: "form",
  tracking_artifact: { template_id: "frm.rainout_decision" },
  expected_completion: "T-90min",
};

// Activity 2 — day_setup, no tag constraints, manual (does NOT count toward
// automation backlog references).
const actFieldSetup: Activity = {
  id: "act.field_setup",
  name: "Field setup",
  description: "Walk the field, place cones, raise nets.",
  trigger: "60 minutes before first kickoff",
  phase: "day_setup",
  sport_tags: [],
  venue_tags: [],
  format_tags: [],
  audience_tags: [],
  raci: {
    accountable: "role.venue_manager",
    responsible: ["role.coach"],
    consulted: [],
    informed: [],
  },
  automation_status: "manual",
  platform_features: ["feat.weather_alert_dashboard"],
  escalation_path: "Venue Manager radios assistant.",
  sop_body: "Place cones at the corners.",
  tracking_method: "checklist",
  tracking_artifact: { template_id: "chk.field_setup" },
  expected_completion: "T-60min",
};

// Activity 3 — post_game, soccer + indoor, platform.
const actPostGameReport: Activity = {
  id: "act.post_game_report",
  name: "Post-game report",
  description: "Send recap and stats to parents and coaches.",
  trigger: "Match final whistle",
  phase: "post_game",
  sport_tags: ["soccer"],
  venue_tags: ["indoor"],
  format_tags: [],
  audience_tags: [],
  raci: {
    accountable: "role.coach",
    responsible: ["role.coach"],
    consulted: [],
    informed: ["role.parent"],
  },
  automation_status: "platform",
  platform_features: ["feat.cancellation_broadcast"],
  escalation_path: "If Coach unavailable, Venue Manager files report.",
  sop_body: "Open recap form, attach stats, submit.",
  tracking_method: "checklist",
  tracking_artifact: { template_id: "chk.field_setup" },
  expected_completion: "T+30min",
};

export function buildInlineCatalog(): Catalog {
  return {
    roles: [roleVenueManager, roleCoach, roleParent],
    features: [featAlertDash, featCancelBroadcast],
    artifacts: [artifactRainoutForm, artifactSetupChecklist],
    activities: [actRainout, actFieldSetup, actPostGameReport],
  };
}

export const fixtureIds = {
  roles: {
    venueManager: roleVenueManager.id,
    coach: roleCoach.id,
    parent: roleParent.id,
  },
  features: {
    weatherDash: featAlertDash.id,
    cancellation: featCancelBroadcast.id,
  },
  activities: {
    rainout: actRainout.id,
    fieldSetup: actFieldSetup.id,
    postGameReport: actPostGameReport.id,
  },
} as const;
