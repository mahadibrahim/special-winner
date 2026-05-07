/**
 * Derive the tag dimensions used to filter the activity catalog for a
 * given game's context. Pure function — no DB, no async.
 */

export interface TagContextInput {
  venue: {
    indoor: boolean;
    owned: boolean;
    concessions: boolean;
    parkingManaged: boolean;
  };
  program: {
    programType: string;
    audienceType: string;
    sport: { slug: string };
  };
}

export interface TagContext {
  sport_tags: string[];
  venue_tags: string[];
  format_tags: string[];
  audience_tags: ("youth" | "adult" | "mixed")[];
}

export function deriveTagContext(input: TagContextInput): TagContext {
  const indoorOutdoor = input.venue.indoor ? "indoor" : "outdoor";

  return {
    sport_tags: [`${indoorOutdoor}:${input.program.sport.slug}`],
    venue_tags: [
      indoorOutdoor,
      input.venue.owned ? "owned" : "rented",
      ...(input.venue.concessions ? ["concessions"] : []),
      ...(input.venue.parkingManaged ? ["parking_managed"] : []),
    ],
    format_tags: [input.program.programType],
    audience_tags: [input.program.audienceType === "parents" ? "youth" : "adult"],
  };
}
