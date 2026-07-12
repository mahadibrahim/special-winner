// Curated Google-review quotes for the homepage social-proof section.
// Content policy: only real reviews, copied verbatim (light trimming OK),
// from the facilities' Google Business profiles. The section is hidden
// until this file is populated — never ship placeholder quotes.

export interface HomeReview {
  quote: string;
  /** Reviewer first name + last initial, e.g. "Marcus T." */
  name: string;
  /** Context chip, e.g. "LEAGUE PLAYER", "PICKUP REGULAR", "YOUTH PARENT" */
  context: string;
  /** 1–5 */
  stars: number;
}

/** Aggregate rating shown next to the section title. Null hides the section. */
export const HOME_GOOGLE_RATING: { score: string; source: string } | null = null;

export const HOME_REVIEWS: HomeReview[] = [];
