/**
 * Role descriptions for the careers pages. One source of content, two
 * brand skins: /careers (Aspire, editorial cream) and the SoccerOne
 * /careers rewrite (dark/lime) both render from this list, so the copy
 * can't drift between brands.
 *
 * Copy discipline: only claims the site already makes elsewhere (league
 * schedule, facility count, youth timeline). No pay ranges or benefit
 * promises until ops provides real numbers.
 */
export interface CareerRole {
  id: "referee" | "coach" | "staff";
  title: string;
  timing: string;
  blurb: string;
  points: string[];
}

export const CAREER_ROLES: CareerRole[] = [
  {
    id: "referee",
    title: "Referee — Adult Leagues",
    timing: "Hiring now for Fall (kicks off Sep 14)",
    blurb:
      "Officiate 7v7 adult matches across our Worthington and Downtown facilities. Games run evenings and weekends, year-round.",
    points: [
      "Coed, men's, and women's divisions from rec to competitive",
      "Indoor, sand-filled turf — no rainouts",
      "Tell us your grade and experience; newer officials welcome to apply",
    ],
  },
  {
    id: "coach",
    title: "Coach",
    timing: "Camps now · full youth programs launch 2027",
    blurb:
      "We're building the coaching bench ahead of our youth program launch. Camps and clinics are already running; season-long coaching roles ramp from there.",
    points: [
      "Summer camps and clinics at Worthington",
      "Youth league and academy roles as programs launch",
      "Playing or coaching background at any level — tell us yours",
    ],
  },
  {
    id: "staff",
    title: "Facility Crew",
    timing: "Ongoing",
    blurb:
      "Front desk, drop-in check-in, and day-of operations that keep three indoor fields running from 4 PM to midnight.",
    points: [
      "Evening and weekend shifts across both facilities",
      "Customer-facing — you're the first person every player meets",
    ],
  },
];
