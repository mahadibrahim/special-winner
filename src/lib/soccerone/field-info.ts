/**
 * Static per-field specs for the SoccerOne rental booking UI. Keyed by a
 * normalized field name (lowercased, "field" suffix stripped). Marketing data
 * that mirrors the Worthington/Downtown location pages.
 */
export interface FieldInfo {
  label: string;       // display name, e.g. "Orange Field"
  dimensions: string;  // e.g. "110 × 60"
  surface: string;     // e.g. "Boarded, sand-filled turf"
  format: string;      // e.g. "Full-size" / "Built for 6v6"
  location: string;    // where it sits in the facility
}

export const FIELD_INFO: Record<string, FieldInfo> = {
  orange: {
    label: "Orange Field",
    dimensions: "110 × 60",
    surface: "Boarded, sand-filled turf",
    format: "Full-size",
    location: "Worthington — 535 Lakeview Plaza Blvd",
  },
  blue: {
    label: "Blue Field",
    dimensions: "110 × 60",
    surface: "Boarded, sand-filled turf",
    format: "Full-size",
    location: "Worthington — 535 Lakeview Plaza Blvd",
  },
  yellow: {
    label: "Yellow Field",
    dimensions: "130 × 45",
    surface: "Sand-filled turf",
    format: "Built for 6v6",
    location: "Downtown — 980 E Starr Ave",
  },
};

/** Resolve a venue's display name to its FieldInfo, or null if unknown. */
export function fieldInfoForName(name: string): FieldInfo | null {
  const key = name.toLowerCase().replace(/\bfield\b/g, "").trim();
  return FIELD_INFO[key] ?? null;
}
