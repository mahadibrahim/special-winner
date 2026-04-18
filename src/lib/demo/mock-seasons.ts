/**
 * Mock season data for the public programs directory and registration flow.
 *
 * Used by /api/public/seasons and /api/public/seasons/[id] so the homepage
 * directory and the registration wizard see consistent Spring 2026 data
 * without needing a seeded production DB.
 */

export interface MockSeason {
  id: string;
  name: string;
  slug: string;
  startDate: string;
  endDate: string;
  price: number;
  priceCents: number;
  deposit: number | null;
  depositCents: number | null;
  allowDeposit: boolean;
  maxParticipants: number | null;
  registeredCount: number;
  spotsLeft: number | null;
  scheduleNotes: string | null;
  status: string;
  registrationOpens?: string | null;
  registrationCloses?: string | null;
  program: {
    id: string;
    name: string;
    slug: string;
    description?: string;
    programType: string;
  };
  sport: {
    id: string;
    name: string;
    slug: string;
    icon: string | null;
    color: string | null;
  };
  location: {
    id: string;
    name: string;
    slug: string;
    address?: string | null;
    city: string | null;
    state: string | null;
  };
  ageGroup: {
    id: string;
    name: string;
    minAge: number;
    maxAge: number;
  } | null;
}

const SOCCER = { id: "1", name: "Soccer", slug: "soccer", icon: "⚽", color: "#22c55e" };
const BASKETBALL = { id: "2", name: "Basketball", slug: "basketball", icon: "🏀", color: "#f97316" };
const HOCKEY = { id: "3", name: "Hockey", slug: "hockey", icon: "🏒", color: "#0ea5e9" };
const BASEBALL = { id: "4", name: "Baseball", slug: "baseball", icon: "⚾", color: "#dc2626" };

const POWELL = {
  id: "1",
  name: "Powell Main",
  slug: "powell",
  address: "150 W Olentangy St",
  city: "Powell",
  state: "OH",
};
const DUBLIN = {
  id: "2",
  name: "Dublin North",
  slug: "dublin",
  address: "5600 Post Rd",
  city: "Dublin",
  state: "OH",
};

const U6 = { id: "ag1", name: "U6", minAge: 4, maxAge: 6 };
const U8 = { id: "ag2", name: "U8", minAge: 6, maxAge: 8 };
const U10 = { id: "ag3", name: "U10", minAge: 8, maxAge: 10 };
const U12 = { id: "ag4", name: "U12", minAge: 10, maxAge: 12 };
const U14 = { id: "ag5", name: "U14", minAge: 12, maxAge: 14 };

function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

function make(
  id: string,
  name: string,
  slug: string,
  overrides: Partial<MockSeason>,
): MockSeason {
  const base: MockSeason = {
    id,
    name,
    slug,
    startDate: "2026-04-25",
    endDate: "2026-06-27",
    price: 165,
    priceCents: toCents(165),
    deposit: 30,
    depositCents: toCents(30),
    allowDeposit: true,
    maxParticipants: 48,
    registeredCount: 0,
    spotsLeft: 48,
    scheduleNotes: null,
    status: "open",
    registrationOpens: "2026-02-15T00:00:00Z",
    registrationCloses: "2026-04-20T23:59:59Z",
    program: { id: "1", name: "Youth Soccer", slug: "youth-soccer", programType: "league" },
    sport: SOCCER,
    location: POWELL,
    ageGroup: U8,
  };
  return { ...base, ...overrides };
}

export const mockSeasons: MockSeason[] = [
  // Soccer — Powell — Spring 2026
  make("1", "U6 Soccer · Spring 2026", "u6-soccer-spring-2026", {
    price: 145,
    priceCents: toCents(145),
    deposit: 25,
    depositCents: toCents(25),
    maxParticipants: 48,
    registeredCount: 38,
    spotsLeft: 10,
    scheduleNotes: "Saturdays · 9:00–9:45 AM",
    ageGroup: U6,
    program: {
      id: "1",
      name: "Youth Soccer",
      slug: "youth-soccer",
      programType: "league",
      description:
        "Our flagship development program for the youngest Aspire players. Saturday-morning sessions blend ball mastery, confidence on the ball, and guided small-sided play.",
    },
  }),
  make("2", "U8 Soccer · Spring 2026", "u8-soccer-spring-2026", {
    price: 165,
    priceCents: toCents(165),
    deposit: 30,
    depositCents: toCents(30),
    maxParticipants: 64,
    registeredCount: 52,
    spotsLeft: 12,
    scheduleNotes: "Saturdays · 10:00–11:00 AM",
    ageGroup: U8,
    program: {
      id: "1",
      name: "Youth Soccer",
      slug: "youth-soccer",
      programType: "league",
      description:
        "Eight weeks of structured skill progressions and competitive small-sided games for ages 6–8. Every session is built from the Aspire coaching guide.",
    },
  }),
  make("3", "U10 Soccer · Spring 2026", "u10-soccer-spring-2026", {
    price: 185,
    priceCents: toCents(185),
    deposit: 35,
    depositCents: toCents(35),
    maxParticipants: 72,
    registeredCount: 67,
    spotsLeft: 5,
    scheduleNotes: "Saturdays · 11:30 AM – 12:45 PM",
    ageGroup: U10,
  }),
  make("4", "U12 Soccer · Spring 2026", "u12-soccer-spring-2026", {
    price: 205,
    priceCents: toCents(205),
    deposit: 40,
    depositCents: toCents(40),
    maxParticipants: 48,
    registeredCount: 48,
    spotsLeft: 0,
    scheduleNotes: "Saturdays · 1:00–2:15 PM",
    ageGroup: U12,
  }),

  // Basketball — Powell
  make("5", "U8 Basketball · Spring 2026", "u8-basketball-spring-2026", {
    startDate: "2026-04-20",
    endDate: "2026-06-22",
    price: 155,
    priceCents: toCents(155),
    deposit: 30,
    depositCents: toCents(30),
    maxParticipants: 40,
    registeredCount: 29,
    spotsLeft: 11,
    scheduleNotes: "Mondays · 5:30–6:30 PM · Powell Rec",
    sport: BASKETBALL,
    program: { id: "2", name: "Youth Basketball", slug: "youth-basketball", programType: "league" },
    ageGroup: U8,
  }),
  make("6", "U10 Basketball · Spring 2026", "u10-basketball-spring-2026", {
    startDate: "2026-04-20",
    endDate: "2026-06-22",
    price: 175,
    priceCents: toCents(175),
    deposit: 35,
    depositCents: toCents(35),
    maxParticipants: 40,
    registeredCount: 36,
    spotsLeft: 4,
    scheduleNotes: "Mondays · 6:45–7:45 PM · Powell Rec",
    sport: BASKETBALL,
    program: { id: "2", name: "Youth Basketball", slug: "youth-basketball", programType: "league" },
    ageGroup: U10,
  }),
  make("7", "U12 Basketball · Spring 2026", "u12-basketball-spring-2026", {
    startDate: "2026-04-20",
    endDate: "2026-06-22",
    price: 195,
    priceCents: toCents(195),
    deposit: 40,
    depositCents: toCents(40),
    maxParticipants: 36,
    registeredCount: 22,
    spotsLeft: 14,
    scheduleNotes: "Wednesdays · 6:00–7:15 PM · Powell Rec",
    sport: BASKETBALL,
    program: { id: "2", name: "Youth Basketball", slug: "youth-basketball", programType: "league" },
    ageGroup: U12,
  }),

  // Hockey — Dublin
  make("8", "U8 Learn-to-Skate Hockey · Spring 2026", "u8-hockey-spring-2026", {
    startDate: "2026-05-02",
    endDate: "2026-07-11",
    price: 225,
    priceCents: toCents(225),
    deposit: 50,
    depositCents: toCents(50),
    maxParticipants: 24,
    registeredCount: 19,
    spotsLeft: 5,
    scheduleNotes: "Saturdays · 8:00–9:00 AM · Dublin Ice",
    sport: HOCKEY,
    location: DUBLIN,
    program: { id: "3", name: "Youth Hockey", slug: "youth-hockey", programType: "league" },
    ageGroup: U8,
  }),
  make("9", "U10 Hockey · Spring 2026", "u10-hockey-spring-2026", {
    startDate: "2026-05-02",
    endDate: "2026-07-11",
    price: 265,
    priceCents: toCents(265),
    deposit: 60,
    depositCents: toCents(60),
    maxParticipants: 30,
    registeredCount: 30,
    spotsLeft: 0,
    scheduleNotes: "Saturdays · 9:15–10:30 AM · Dublin Ice",
    sport: HOCKEY,
    location: DUBLIN,
    program: { id: "3", name: "Youth Hockey", slug: "youth-hockey", programType: "league" },
    ageGroup: U10,
  }),
  make("10", "U12 Hockey · Spring 2026", "u12-hockey-spring-2026", {
    startDate: "2026-05-02",
    endDate: "2026-07-11",
    price: 285,
    priceCents: toCents(285),
    deposit: 60,
    depositCents: toCents(60),
    maxParticipants: 30,
    registeredCount: 23,
    spotsLeft: 7,
    scheduleNotes: "Saturdays · 10:45 AM – 12:00 PM · Dublin Ice",
    sport: HOCKEY,
    location: DUBLIN,
    program: { id: "3", name: "Youth Hockey", slug: "youth-hockey", programType: "league" },
    ageGroup: U12,
  }),

  // Baseball — Powell
  make("11", "T-Ball · Spring 2026", "tball-spring-2026", {
    startDate: "2026-04-18",
    endDate: "2026-06-13",
    price: 125,
    priceCents: toCents(125),
    deposit: 20,
    depositCents: toCents(20),
    maxParticipants: 60,
    registeredCount: 44,
    spotsLeft: 16,
    scheduleNotes: "Saturdays · 9:00–10:00 AM · Powell Field 2",
    sport: BASEBALL,
    program: { id: "4", name: "Spring Baseball", slug: "spring-baseball", programType: "league" },
    ageGroup: U6,
  }),
  make("12", "Coach-Pitch Baseball · Spring 2026", "coach-pitch-baseball-spring-2026", {
    startDate: "2026-04-18",
    endDate: "2026-06-13",
    price: 155,
    priceCents: toCents(155),
    deposit: 30,
    depositCents: toCents(30),
    maxParticipants: 48,
    registeredCount: 39,
    spotsLeft: 9,
    scheduleNotes: "Saturdays · 10:30–11:45 AM · Powell Field 2",
    sport: BASEBALL,
    program: { id: "4", name: "Spring Baseball", slug: "spring-baseball", programType: "league" },
    ageGroup: U8,
  }),
  make("13", "U10 Kid-Pitch Baseball · Spring 2026", "u10-baseball-spring-2026", {
    startDate: "2026-04-18",
    endDate: "2026-06-13",
    price: 185,
    priceCents: toCents(185),
    deposit: 35,
    depositCents: toCents(35),
    maxParticipants: 36,
    registeredCount: 32,
    spotsLeft: 4,
    scheduleNotes: "Saturdays · 12:00–1:30 PM · Powell Field 1",
    sport: BASEBALL,
    program: { id: "4", name: "Spring Baseball", slug: "spring-baseball", programType: "league" },
    ageGroup: U10,
  }),
  make("14", "U12 Baseball · Spring 2026", "u12-baseball-spring-2026", {
    startDate: "2026-04-18",
    endDate: "2026-06-13",
    price: 205,
    priceCents: toCents(205),
    deposit: 40,
    depositCents: toCents(40),
    maxParticipants: 30,
    registeredCount: 14,
    spotsLeft: 16,
    scheduleNotes: "Tue & Thu · 6:00–7:30 PM · Powell Field 1",
    sport: BASEBALL,
    program: { id: "4", name: "Spring Baseball", slug: "spring-baseball", programType: "league" },
    ageGroup: U12,
  }),
  make("15", "U14 Baseball · Spring 2026", "u14-baseball-spring-2026", {
    startDate: "2026-04-18",
    endDate: "2026-06-13",
    price: 225,
    priceCents: toCents(225),
    deposit: 45,
    depositCents: toCents(45),
    maxParticipants: 24,
    registeredCount: 9,
    spotsLeft: 15,
    scheduleNotes: "Tue & Thu · 6:00–7:30 PM · Powell Field 3",
    sport: BASEBALL,
    program: { id: "4", name: "Spring Baseball", slug: "spring-baseball", programType: "league" },
    ageGroup: U14,
  }),
];

export function findMockSeason(id: string): MockSeason | undefined {
  return mockSeasons.find((s) => s.id === id);
}
