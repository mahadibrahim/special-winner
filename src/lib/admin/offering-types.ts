export type OfferingType = "camp" | "tournament" | "league";

export type OfferingFieldKey =
  | "dateRange"
  | "dailyTimes"
  | "gameDayTime"
  | "fullDayPrice"
  | "halfDayPrice"
  | "teamPrice"
  | "individualPrice"
  | "ageRange"
  | "ageGroup"
  | "divisions"
  | "capacityKids"
  | "capacityTeams"
  | "deposit";

export interface OfferingTypeConfig {
  label: string;
  description: string;
  fields: OfferingFieldKey[];
  required: OfferingFieldKey[];
}

export const OFFERING_TYPES: Record<OfferingType, OfferingTypeConfig> = {
  camp: {
    label: "Camp",
    description: "A multi-day camp kids register for individually.",
    fields: ["dateRange", "dailyTimes", "fullDayPrice", "halfDayPrice", "ageRange", "capacityKids", "deposit"],
    required: ["dateRange", "fullDayPrice", "ageRange"],
  },
  tournament: {
    label: "Tournament",
    description: "A single- or multi-day event teams enter.",
    fields: ["dateRange", "gameDayTime", "teamPrice", "individualPrice", "divisions", "ageGroup", "capacityTeams"],
    required: ["dateRange", "teamPrice"],
  },
  league: {
    label: "League",
    description: "A recurring season with weekly games.",
    fields: ["dateRange", "gameDayTime", "individualPrice", "teamPrice", "divisions", "ageGroup", "capacityKids", "deposit"],
    required: ["dateRange", "individualPrice"],
  },
};

export function offeringFieldShown(type: OfferingType, key: OfferingFieldKey): boolean {
  return OFFERING_TYPES[type].fields.includes(key);
}

export function offeringFieldRequired(type: OfferingType, key: OfferingFieldKey): boolean {
  return OFFERING_TYPES[type].required.includes(key);
}
