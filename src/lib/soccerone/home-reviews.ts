// Curated Google-review quotes for the homepage social-proof section.
// Content policy: only real reviews, copied verbatim (light trimming OK),
// from the facilities' Google Business profiles. The section is hidden
// until this file is populated — never ship placeholder quotes.
//
// Source: "Soccer ONE Indoor Soccer" Google Business listing (980 E Starr
// Ave, Columbus) — 4.7 across 17 reviews, curated 2026-07-12. All three
// quotes verified 5-star; trims noted inline.

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
export const HOME_GOOGLE_RATING: { score: string; source: string } | null = {
  score: "4.7",
  source: "GOOGLE REVIEWS · COLUMBUS",
};

export const HOME_REVIEWS: HomeReview[] = [
  {
    // Verbatim opening of the review; trimmed at the sentence boundary
    // where Google truncates.
    quote:
      "Excellent indoor soccer facility! The entire venue is exceptionally clean and well-maintained, which makes for a great experience from the moment you walk in.",
    name: "Warsame W.",
    context: "LOCAL GUIDE",
    stars: 5,
  },
  {
    // Verbatim minus a leading "New facility." (review is from opening
    // year); reviewer's own lowercase kept.
    quote:
      "easy scheduling and friendly staff. rental prices are very reasonable and facility/turf is in great condition.",
    name: "Yusuf F.",
    context: "FIELD RENTAL",
    stars: 5,
  },
  {
    // Verbatim, complete.
    quote:
      "Great place to practice indoor activities. The turf is always in good condition. I highly recommend this place.",
    name: "New Hope Foundation",
    context: "TEAM TRAINING",
    stars: 5,
  },
];
