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

/** Fallback dot/accent color for a field name that doesn't match a known color word. */
export const FIELD_COLOR_FALLBACK = "#a3e635"; // var(--so-lime)

/**
 * Resolve a field/venue display name (e.g. "Orange Field", "Field 2") to an
 * accent color for chips and diagrams. Falls back to lime for names that
 * don't carry a recognized color word.
 */
export function fieldColorForName(name: string): string {
  const key = name.toLowerCase();
  if (key.includes("orange")) return "#f97316";
  if (key.includes("blue")) return "#3b82f6";
  if (key.includes("yellow")) return "#facc15";
  return FIELD_COLOR_FALLBACK;
}
