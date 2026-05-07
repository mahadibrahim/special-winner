// Automation backlog view — for each platform feature, list the activities
// that depend on it being built (i.e., reference it AND are tagged as
// platform-/hybrid-automated). Manual-only activities are excluded so the
// backlog doesn't get padded with features whose owners chose to stay manual.

import type { Catalog } from "../loader";
import type { Feature } from "../types/feature";

export interface AutomationBacklogEntry extends Feature {
  referenced_by: string[];
}

export function generateAutomationBacklog(catalog: Catalog): AutomationBacklogEntry[] {
  const refsByFeature = new Map<string, Set<string>>();
  for (const feature of catalog.features) {
    refsByFeature.set(feature.id, new Set());
  }

  for (const activity of catalog.activities) {
    if (
      activity.automation_status !== "platform" &&
      activity.automation_status !== "hybrid"
    ) {
      continue;
    }
    for (const featureId of activity.platform_features) {
      const set = refsByFeature.get(featureId);
      if (!set) continue; // dangling refs are caught by the validator
      set.add(activity.id);
    }
  }

  const entries: AutomationBacklogEntry[] = catalog.features.map((feature) => ({
    ...feature,
    referenced_by: [...(refsByFeature.get(feature.id) ?? new Set<string>())].sort(),
  }));

  entries.sort((a, b) => b.referenced_by.length - a.referenced_by.length);

  return entries;
}
