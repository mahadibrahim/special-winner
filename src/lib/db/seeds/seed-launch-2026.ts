/**
 * Launch Catalog Seed — Summer + Fall 2026
 *
 * Creates the customer-facing program catalog for the Soccer One
 * partnership launch. Idempotent: re-running upserts existing rows
 * by slug rather than failing.
 *
 * Strategy refs:
 *   - docs/strategy/summer-2026-calendar.md
 *   - docs/strategy/indoor-soccer-programming-plan-2026-04.md
 *   - docs/strategy/indoor-soccer-pricing-strategy-2026-04.md
 *   - docs/strategy/indoor-soccer-tournament-strategy-2026-04.md
 *
 * Run with: tsx src/lib/db/seeds/seed-launch-2026.ts
 *
 * Seasons are inserted with status='draft'. Flip to 'open' from the
 * admin UI when each registration window opens — no code change needed.
 */

import "dotenv/config";

import { eq, and } from "drizzle-orm";
import { getDb } from "../index";
import { hashPassword } from "../../auth/password";
import {
  users,
  roles,
  userRoles,
  organizations,
  locations,
  sports,
  programs,
  seasons,
  ageGroups,
  venues,
} from "../schema";

// ────────────────────────────────────────────────────────────────────────────
// Foundation data — orgs, sport, locations, age groups, venues
// ────────────────────────────────────────────────────────────────────────────

const SOCCERONE_ORG = {
  slug: "soccerone",
  name: "Soccer One",
  legalName: "Soccer One Indoor LLC",
  description: "Indoor soccer programming at Worthington + Downtown Columbus",
  organizationType: "headquarters" as const,
  status: "active" as const,
  email: "hello@aspiresportsohio.com",
  timezone: "America/New_York",
  country: "US",
};

const ASPIRE_HQ_ORG = {
  slug: "aspire-sports",
  name: "Aspire Sports",
  legalName: "Aspire Sports Holdings LLC",
  description: "Multi-sport youth + adult programming",
  organizationType: "headquarters" as const,
  status: "active" as const,
  email: "hello@aspiresportsohio.com",
  timezone: "America/New_York",
  country: "US",
};

const ADMIN_USER = {
  email: "mahad.ibrahim@gmail.com",
  firstName: "Mahad",
  lastName: "Ibrahim",
  // Password not set — admin signs in via magic link / OAuth.
  // If a password is needed, use the admin password-reset flow.
};

const SOCCER_SPORT = {
  slug: "soccer",
  name: "Soccer",
  icon: "⚽",
  color: "#16a34a",
};

const WORTHINGTON_LOCATION = {
  slug: "worthington",
  name: "Soccer One Worthington",
  description: "Suburban family programming — youth, families, community leagues",
  city: "Worthington",
  state: "OH",
  country: "US",
  timezone: "America/New_York",
  active: true,
};

const DOWNTOWN_LOCATION = {
  slug: "downtown",
  name: "Soccer One Downtown",
  description: "Urban adult programming — OSU corridor, professional + student leagues",
  city: "Columbus",
  state: "OH",
  country: "US",
  timezone: "America/New_York",
  active: true,
};

// Venues — schema has no slug; uniqueness is by (locationId, name).
const WORTHINGTON_VENUES = [
  { name: "Field A", notes: "Worthington primary field", indoor: true },
  { name: "Field B", notes: "Worthington secondary field", indoor: true },
  { name: "Field C", notes: "Worthington tertiary field", indoor: true },
];

const DOWNTOWN_VENUES = [
  { name: "Field 1", notes: "Downtown primary field", indoor: true },
];

// Age groups span youth and adult tiers used across summer + fall programs.
// Schema (sports.ts) has no slug — lookup by (organizationId, name).
// We use the `key` field locally as a stable lookup token; it is not persisted.
const AGE_GROUPS = [
  { key: "u6", name: "U6", minAge: 4, maxAge: 6, description: "Under 6" },
  { key: "u8", name: "U8", minAge: 7, maxAge: 8, description: "Under 8" },
  { key: "u10", name: "U10", minAge: 9, maxAge: 10, description: "Under 10" },
  { key: "u12", name: "U12", minAge: 11, maxAge: 12, description: "Under 12" },
  { key: "u14", name: "U14", minAge: 13, maxAge: 14, description: "Under 14" },
  { key: "hs", name: "High School", minAge: 14, maxAge: 18, description: "High school 9th–12th" },
  { key: "ages-6-9", name: "Ages 6–9", minAge: 6, maxAge: 9, description: "Skills clinic age band" },
  { key: "ages-10-12", name: "Ages 10–12", minAge: 10, maxAge: 12, description: "Skills clinic age band" },
  { key: "ages-13-plus", name: "Ages 13+", minAge: 13, maxAge: 18, description: "Skills clinic age band" },
  { key: "adult-open", name: "Adult Open", minAge: 18, maxAge: 99, description: "Open adult — no age cap" },
  { key: "adult-30-plus", name: "Adult Over 30", minAge: 30, maxAge: 99, description: "Adult masters 30+" },
  { key: "adult-40-plus", name: "Adult Over 40", minAge: 40, maxAge: 99, description: "Adult masters 40+" },
  { key: "adult-50-plus", name: "Senior 50+", minAge: 50, maxAge: 99, description: "Walking soccer — low intensity" },
  { key: "tot", name: "Toddler", minAge: 2, maxAge: 4, description: "Mom & Tot Soccer" },
];

// ────────────────────────────────────────────────────────────────────────────
// Programs — each is a recurring offering (multiple seasons land under it)
// ────────────────────────────────────────────────────────────────────────────

type ProgramType = "league" | "camp" | "clinic" | "tournament" | "training";

interface ProgramDef {
  slug: string;
  name: string;
  description: string;
  programType: ProgramType;
  locationSlug: "worthington" | "downtown";
  audienceType: "parents" | "adults"; // "parents" registers a child; "adults" registers self
  // Default age group for seasons under this program. Each season inherits
  // this unless explicitly overridden in the season definition.
  defaultAgeGroupKey?: string;
}

// Programs are identity-stable across seasons. e.g. "Liga Latina Hombres"
// is one program; its summer and fall seasons are two seasons under it.
const PROGRAMS: ProgramDef[] = [
  // ── Worthington matched-Resolute lineup (one program per day-division-tier combo) ──
  {
    slug: "wo-mon-coed-c",
    name: "Mon Coed Open C",
    description: "6v6 indoor coed adult, open level (competitive). Mondays at Worthington.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "wo-mon-coed-d",
    name: "Mon Coed Open D",
    description: "6v6 indoor coed adult, open level (recreational). Mondays at Worthington.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "wo-mon-mens-c",
    name: "Mon Men's Open C",
    description: "6v6 indoor men's adult, open level (competitive). Mondays at Worthington.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "wo-mon-mens-d",
    name: "Mon Men's Open D",
    description: "6v6 indoor men's adult, open level (recreational). Mondays at Worthington.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "wo-tue-coed-c",
    name: "Tue Coed Open C",
    description: "6v6 indoor coed adult, open level (competitive). Tuesdays at Worthington.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "wo-tue-coed-d",
    name: "Tue Coed Open D",
    description: "6v6 indoor coed adult, open level (recreational). Tuesdays at Worthington.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "wo-tue-mens30-c",
    name: "Tue Men's Over 30 C",
    description: "6v6 indoor men's masters 30+, open level (competitive). Tuesdays at Worthington.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-30-plus",
  },
  {
    slug: "wo-tue-mens30-d",
    name: "Tue Men's Over 30 D",
    description: "6v6 indoor men's masters 30+, open level (recreational). Tuesdays at Worthington.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-30-plus",
  },
  {
    slug: "wo-wed-womens",
    name: "Wed Women's Open",
    description: "6v6 indoor women's adult open. Wednesdays at Worthington.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "wo-wed-womens40",
    name: "Wed Women's Over 40",
    description: "6v6 indoor women's masters 40+. Wednesdays at Worthington.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-40-plus",
  },
  {
    slug: "wo-wed-mens-c",
    name: "Wed Men's Open C",
    description: "6v6 indoor men's adult, open level (competitive). Wednesdays at Worthington.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "wo-wed-mens-d",
    name: "Wed Men's Open D",
    description: "6v6 indoor men's adult, open level (recreational). Wednesdays at Worthington.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "wo-thu-coed-c",
    name: "Thu Coed Open C",
    description: "6v6 indoor coed adult, open level (competitive). Thursdays at Worthington.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "wo-thu-coed-d",
    name: "Thu Coed Open D",
    description: "6v6 indoor coed adult, open level (recreational). Thursdays at Worthington.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "wo-fri-coed-c",
    name: "Fri Coed Open C",
    description: "6v6 indoor coed adult, open level (competitive). Fridays at Worthington.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "wo-fri-coed-d",
    name: "Fri Coed Open D",
    description: "6v6 indoor coed adult, open level (recreational). Fridays at Worthington.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "wo-fri-coed30-c",
    name: "Fri Coed Over 30 C",
    description: "6v6 indoor coed adult 30+, open level (competitive). Fridays at Worthington.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-30-plus",
  },
  {
    slug: "wo-fri-coed30-d",
    name: "Fri Coed Over 30 D",
    description: "6v6 indoor coed adult 30+, open level (recreational). Fridays at Worthington.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-30-plus",
  },
  {
    slug: "wo-sun-coed-c",
    name: "Sun Coed Open C",
    description: "6v6 indoor coed adult, open level (competitive). Sundays at Worthington.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "wo-sun-coed-d",
    name: "Sun Coed Open D",
    description: "6v6 indoor coed adult, open level (recreational). Sundays at Worthington.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "wo-free-agent",
    name: "Worthington Free Agent",
    description: "Don't have a team? Sign up as a free agent and we'll place you on a house team.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },

  // ── Worthington community leagues (year-round, day-late slots stay) ──
  {
    slug: "liga-latina-hombres",
    name: "Liga Latina Hombres",
    description: "Liga Latina men's open. Sundays 1–5pm at Worthington. 7v7 Express format. Spanish-language ops.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "liga-latina-mixta",
    name: "Liga Latina Mixta",
    description: "Liga Latina coed. Sundays 5–9pm at Worthington. 7v7 Express format. Spanish-language ops.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "liga-latina-late",
    name: "Liga Latina Late",
    description: "Late-night Liga Latina. Saturdays 10pm–12am at Worthington. Restaurant/hospitality industry slot.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "africa-cup-mens",
    name: "Aspire Africa Cup — Men's",
    description: "Africa Cup men's open. Saturdays 5–9pm at Worthington. 7v7 Express format.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "africa-cup-coed",
    name: "Aspire Africa Cup — Coed",
    description: "Africa Cup coed. Saturdays 9–11pm at Worthington. Post-Maghrib family-friendly slot.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "africa-cup-late",
    name: "Aspire Africa Cup Late",
    description: "Late-night Africa Cup. Saturdays 11pm–1am at Worthington. 7v7 Express format.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "asia-cup-mens",
    name: "Aspire Asia Cup — Men's",
    description: "Asia Cup MENA + South Asian men's open. Sundays 9am–1pm at Worthington. 7v7 Express format.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },

  // ── Worthington off-peak fillers ──
  {
    slug: "walking-soccer-50",
    name: "Walking Soccer 50+",
    description: "Low-intensity walking soccer for adults 50+. M/W/F 8am at Worthington.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-50-plus",
  },
  {
    slug: "mom-and-tot",
    name: "Mom & Tot Soccer",
    description: "Parent-toddler soccer fundamentals. T/Th 9am at Worthington.",
    programType: "clinic",
    locationSlug: "worthington",
    audienceType: "parents",
    defaultAgeGroupKey: "tot",
  },
  {
    slug: "skills-6-9",
    name: "After-school Skills (Ages 6–9)",
    description: "After-school skills clinic for ages 6–9. M–F 3pm at Worthington. 4-week cycles.",
    programType: "clinic",
    locationSlug: "worthington",
    audienceType: "parents",
    defaultAgeGroupKey: "ages-6-9",
  },
  {
    slug: "skills-10-12",
    name: "After-school Skills (Ages 10–12)",
    description: "After-school skills clinic for ages 10–12. M–F 4pm at Worthington. 4-week cycles.",
    programType: "clinic",
    locationSlug: "worthington",
    audienceType: "parents",
    defaultAgeGroupKey: "ages-10-12",
  },
  {
    slug: "skills-13-plus",
    name: "After-school Academy (Ages 13+)",
    description: "After-school academy track for ages 13+. M–F 5pm at Worthington. 4-week cycles.",
    programType: "clinic",
    locationSlug: "worthington",
    audienceType: "parents",
    defaultAgeGroupKey: "ages-13-plus",
  },
  {
    slug: "goalkeeper-academy",
    name: "Goalkeeper Academy",
    description: "Specialty goalkeeper training. Sundays 11am at Worthington. 4-week cycles.",
    programType: "training",
    locationSlug: "worthington",
    audienceType: "parents",
    defaultAgeGroupKey: "ages-10-12",
  },
  {
    slug: "youth-summer-4v4",
    name: "Youth Summer 4v4",
    description: "Youth 4v4 league for U10/U12/U14. T/Th 5–7pm at Worthington (summer only).",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "parents",
    defaultAgeGroupKey: "u12",
  },
  {
    slug: "heritage-youth-saturday",
    name: "Heritage Youth Saturday",
    description: "5v5 mixed youth league with cultural-celebration weeks. Saturdays 9am–1pm at Worthington.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "parents",
    defaultAgeGroupKey: "u12",
  },

  // ── Worthington summer day camps (programType=camp) ──
  {
    slug: "camp-skills",
    name: "Day Camp — Skills Week",
    description: "Foundation week — passing, dribbling, shooting. Full-day 9am–4pm. Worthington.",
    programType: "camp",
    locationSlug: "worthington",
    audienceType: "parents",
    defaultAgeGroupKey: "ages-6-9",
  },
  {
    slug: "camp-world-cup",
    name: "Day Camp — World Cup Week",
    description: "Each kid drafted to a country, week ends with World Cup mini-tournament. Worthington.",
    programType: "camp",
    locationSlug: "worthington",
    audienceType: "parents",
    defaultAgeGroupKey: "ages-6-9",
  },
  {
    slug: "camp-goalkeeper",
    name: "Day Camp — Goalkeeper Week",
    description: "Specialty goalkeeper week, premium pricing. Worthington.",
    programType: "camp",
    locationSlug: "worthington",
    audienceType: "parents",
    defaultAgeGroupKey: "ages-10-12",
  },
  {
    slug: "camp-star-player",
    name: "Day Camp — Star Player Week",
    description: "Each day spotlights an international star (Messi, Salah, Mbappé, Vinicius). 4-day short week. Worthington.",
    programType: "camp",
    locationSlug: "worthington",
    audienceType: "parents",
    defaultAgeGroupKey: "ages-6-9",
  },
  {
    slug: "camp-speed-agility",
    name: "Day Camp — Speed & Agility Week",
    description: "Athletic-development focus. Worthington.",
    programType: "camp",
    locationSlug: "worthington",
    audienceType: "parents",
    defaultAgeGroupKey: "ages-10-12",
  },
  {
    slug: "camp-tournament-prep",
    name: "Day Camp — Tournament Prep Week",
    description: "Friday-night-lights mini-tournament finale. Worthington.",
    programType: "camp",
    locationSlug: "worthington",
    audienceType: "parents",
    defaultAgeGroupKey: "ages-10-12",
  },
  {
    slug: "camp-heritage",
    name: "Day Camp — Heritage Week",
    description:
      "Each day spotlights a region's soccer culture — Latino, African, MENA, European, USA. Worthington.",
    programType: "camp",
    locationSlug: "worthington",
    audienceType: "parents",
    defaultAgeGroupKey: "ages-6-9",
  },
  {
    slug: "camp-skills-showcase",
    name: "Day Camp — Skills Showcase Week",
    description: "Final week — college coaches invited Friday for HS-aged showcase. Worthington.",
    programType: "camp",
    locationSlug: "worthington",
    audienceType: "parents",
    defaultAgeGroupKey: "ages-13-plus",
  },

  // ── Downtown adult lineup ──
  {
    slug: "do-coed-standard",
    name: "Downtown Adult Coed Standard",
    description: "6v6 indoor coed adult standard. Tuesdays + Thursdays 7–10pm at Downtown.",
    programType: "league",
    locationSlug: "downtown",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "do-happy-hour-express",
    name: "Downtown Happy Hour Express",
    description: "5v5 Express, 25-min games, 4 teams/hr. Mon + Wed 5–7pm at Downtown. Beat-the-rush format.",
    programType: "league",
    locationSlug: "downtown",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "do-late-express",
    name: "Downtown Late Express",
    description: "5v5 Express. Mon + Thu 9–11pm at Downtown. Night-owl crowd.",
    programType: "league",
    locationSlug: "downtown",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "do-osu-pickup",
    name: "OSU Sunday Pickup",
    description: "Drop-in pickup soccer. Sundays 4–7pm at Downtown. $40/mo unlimited or $15/session.",
    programType: "league",
    locationSlug: "downtown",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "do-lunch-league",
    name: "Downtown Lunch League",
    description: "45-min Express, self-officiated. M–F 12–1pm at Downtown. Office-worker BYO uniform.",
    programType: "league",
    locationSlug: "downtown",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "do-greek-im",
    name: "Greek/IM Friday League",
    description: "Fraternity / intramural team league. Fridays 4–7pm at Downtown. Volume discount for orgs.",
    programType: "league",
    locationSlug: "downtown",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "liga-latina-friday",
    name: "Liga Latina Friday Happy Hour",
    description: "Liga Latina downtown Friday social. 6–10pm at Downtown. 5v5 Express.",
    programType: "league",
    locationSlug: "downtown",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "liga-latina-friday-late",
    name: "Liga Latina Friday Late",
    description: "Late-night Liga Latina. Fridays 11pm–1am at Downtown. 5v5 Express. Hospitality industry slot.",
    programType: "league",
    locationSlug: "downtown",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "africa-cup-express-down",
    name: "Africa Cup Express (Downtown)",
    description: "Africa Cup mid-week. Wednesdays 8pm–12am at Downtown. 5v5 Express. East African + OSU crews.",
    programType: "league",
    locationSlug: "downtown",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "asia-cup-friday-late",
    name: "Asia Cup Friday Late Express",
    description: "Asia Cup post-Maghrib slot. Fridays 9pm–1am at Downtown. 5v5 Express.",
    programType: "league",
    locationSlug: "downtown",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "do-friday-after-bar",
    name: "Friday Late After-Bar Express",
    description: "5v5 Express social. Fridays 11pm–1am at Downtown. Beer garden, downtown nightlife crowd.",
    programType: "league",
    locationSlug: "downtown",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
  {
    slug: "do-free-agent",
    name: "Downtown Free Agent",
    description: "Don't have a team? Sign up as a free agent and we'll place you on a house team at Downtown.",
    programType: "league",
    locationSlug: "downtown",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },

  // ── Tournaments — programType=tournament, one program per recurring tournament identity ──
  {
    slug: "memorial-day-premier",
    name: "Memorial Day Premier",
    description: "Opening summer tournament. Youth + adult coed 4v4 + adult premier. Worthington + Downtown.",
    programType: "tournament",
    locationSlug: "worthington",
    audienceType: "adults",
  },
  {
    slug: "eid-al-adha-cup",
    name: "Aspire Eid al-Adha Cup",
    description: "MENA + East African community tournament timed for Eid al-Adha. 7v7 Express men's + Masters 35+.",
    programType: "tournament",
    locationSlug: "worthington",
    audienceType: "adults",
  },
  {
    slug: "liga-latina-kickoff-cup",
    name: "Liga Latina Kickoff Cup (Cinco)",
    description: "Liga Latina season kickoff tournament. Adult coed 5v5 + men's open. Downtown.",
    programType: "tournament",
    locationSlug: "downtown",
    audienceType: "adults",
  },
  {
    slug: "fourth-of-july-express",
    name: "Aspire 4th of July Express",
    description: "Mid-summer attention beat. Adult coed 5v5 Express. Downtown with patriotic theming.",
    programType: "tournament",
    locationSlug: "downtown",
    audienceType: "adults",
  },
  {
    slug: "africa-cup-mid-summer",
    name: "Aspire Africa Cup Mid-Summer Showcase",
    description: "Mid-season Africa Cup showcase. 16-team men's + 8-team coed 7v7 Express. Worthington + Downtown.",
    programType: "tournament",
    locationSlug: "worthington",
    audienceType: "adults",
  },
  {
    slug: "continental-cup-final",
    name: "Aspire Continental Cup Final",
    description:
      "Brand-defining summer event — Liga Latina, Africa Cup, Asia Cup champions meet for the Continental Cup. " +
      "Free for participating champions. Worthington Saturday + Downtown Sunday final.",
    programType: "tournament",
    locationSlug: "worthington",
    audienceType: "adults",
  },
  // Fall tournaments — per programming-plan §6 seasonality table
  {
    slug: "halloween-cup",
    name: "Aspire Halloween Cup",
    description: "Late-October themed tournament. Adult + youth divisions. Costume optional, encouraged.",
    programType: "tournament",
    locationSlug: "worthington",
    audienceType: "adults",
  },
  {
    slug: "turkey-bowl",
    name: "Aspire Turkey Bowl",
    description: "Thanksgiving-week tournament. Adult coed + youth families. Both venues.",
    programType: "tournament",
    locationSlug: "worthington",
    audienceType: "adults",
  },
  {
    slug: "holiday-cup",
    name: "Aspire Holiday Cup",
    description: "Mid-December social tournament. Adult coed only. Light, festive, single-day.",
    programType: "tournament",
    locationSlug: "downtown",
    audienceType: "adults",
  },

  // ── Fall-only additions per the programming-plan seasonality table ──
  {
    slug: "youth-fall-rec-u8",
    name: "Youth Fall Rec League — U8",
    description: "Youth 4v4 fall recreation league. Saturdays at Worthington. Non-travel players.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "parents",
    defaultAgeGroupKey: "u8",
  },
  {
    slug: "youth-fall-rec-u10",
    name: "Youth Fall Rec League — U10",
    description: "Youth 5v5 fall recreation league. Saturdays at Worthington. Non-travel players.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "parents",
    defaultAgeGroupKey: "u10",
  },
  {
    slug: "youth-fall-rec-u12",
    name: "Youth Fall Rec League — U12",
    description: "Youth 5v5 fall recreation league. Saturdays at Worthington. Non-travel players.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "parents",
    defaultAgeGroupKey: "u12",
  },
  {
    slug: "youth-fall-rec-u14",
    name: "Youth Fall Rec League — U14",
    description: "Youth 5v5 fall recreation league. Saturdays at Worthington. Non-travel players.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "parents",
    defaultAgeGroupKey: "u14",
  },
  {
    slug: "hs-coed-saturday",
    name: "HS Coed Saturday League",
    description: "High-school coed Saturday league. Open to non-school-team HS players. Worthington.",
    programType: "league",
    locationSlug: "worthington",
    audienceType: "parents",
    defaultAgeGroupKey: "hs",
  },
  {
    slug: "do-corporate",
    name: "Downtown Corporate League",
    description:
      "Premium corporate league for downtown employers (JPMC, Nationwide, Cardinal Health, Big 4). " +
      "Mon/Tue 9–10pm at Downtown.",
    programType: "league",
    locationSlug: "downtown",
    audienceType: "adults",
    defaultAgeGroupKey: "adult-open",
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Seasons — declarative tables drive bulk insert
// ────────────────────────────────────────────────────────────────────────────

interface SeasonDef {
  programSlug: string;
  slug: string;
  name: string;
  startDate: string; // ISO YYYY-MM-DD
  endDate: string; // ISO YYYY-MM-DD
  registrationOpens?: string; // ISO datetime
  registrationCloses?: string; // ISO datetime
  earlyBirdPriceCents?: number;
  earlyBirdDeadline?: string; // ISO datetime
  priceCents: number;
  depositCents?: number;
  allowDeposit?: boolean;
  maxParticipants?: number;
  minParticipants?: number;
  scheduleNotes?: string;
  // Override the program's defaultAgeGroupKey for this season.
  ageGroupKeyOverride?: string;
}

// Matched-Resolute summer leagues — all $1,050, Wed 2026-06-03 → ~Aug 2,
// 7-game regular + playoffs. Identical params per the strategy doc §3.5.
const MATCHED_RESOLUTE_LEAGUES = [
  "wo-mon-coed-c", "wo-mon-coed-d", "wo-mon-mens-c", "wo-mon-mens-d",
  "wo-tue-coed-c", "wo-tue-coed-d", "wo-tue-mens30-c", "wo-tue-mens30-d",
  "wo-wed-womens", "wo-wed-womens40", "wo-wed-mens-c", "wo-wed-mens-d",
  "wo-thu-coed-c", "wo-thu-coed-d",
  "wo-fri-coed-c", "wo-fri-coed-d", "wo-fri-coed30-c", "wo-fri-coed30-d",
  "wo-sun-coed-c", "wo-sun-coed-d",
];

const SUMMER_2026_SEASONS: SeasonDef[] = [
  // Matched-Resolute lineup (20 leagues) + Free Agent
  ...MATCHED_RESOLUTE_LEAGUES.map((programSlug) => ({
    programSlug,
    slug: `${programSlug}-summer-2026`,
    name: "Summer 2026",
    startDate: "2026-06-03",
    endDate: "2026-08-02",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-05-22T23:59:59Z",
    priceCents: 105000,
    maxParticipants: 8,
    scheduleNotes: "7-game regular season + 1–2 playoff weeks. 6v6 indoor.",
  })),
  {
    programSlug: "wo-free-agent",
    slug: "wo-free-agent-summer-2026",
    name: "Summer 2026",
    startDate: "2026-06-03",
    endDate: "2026-08-02",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-05-22T23:59:59Z",
    priceCents: 12900,
    scheduleNotes: "$129/player house-team placement on a Worthington matched league.",
  },

  // Community leagues (8-game season + 2 playoff = ~10 weeks). Early-bird
  // by 2026-05-15 = $745; standard $795. Single-price seed at standard;
  // discount codes can be configured separately in admin.
  {
    programSlug: "liga-latina-hombres",
    slug: "liga-latina-hombres-summer-2026",
    name: "Summer 2026",
    startDate: "2026-06-01",
    endDate: "2026-08-09",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-05-22T23:59:59Z",
    priceCents: 79500,
    maxParticipants: 16,
    scheduleNotes: "7v7 Express, 8 regular + 2 playoff. Sundays 1–5pm.",
  },
  {
    programSlug: "liga-latina-mixta",
    slug: "liga-latina-mixta-summer-2026",
    name: "Summer 2026",
    startDate: "2026-06-01",
    endDate: "2026-08-09",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-05-22T23:59:59Z",
    priceCents: 79500,
    maxParticipants: 16,
    scheduleNotes: "7v7 Express, coed. Sundays 5–9pm.",
  },
  {
    programSlug: "liga-latina-late",
    slug: "liga-latina-late-summer-2026",
    name: "Summer 2026",
    startDate: "2026-06-06",
    endDate: "2026-08-08",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-05-29T23:59:59Z",
    priceCents: 79500,
    maxParticipants: 6,
    scheduleNotes: "7v7 Express, late-night. Saturdays 10pm–12am.",
  },
  {
    programSlug: "africa-cup-mens",
    slug: "africa-cup-mens-summer-2026",
    name: "Summer 2026",
    startDate: "2026-06-06",
    endDate: "2026-08-08",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-05-22T23:59:59Z",
    priceCents: 79500,
    maxParticipants: 16,
    scheduleNotes: "7v7 Express. Saturdays 5–9pm.",
  },
  {
    programSlug: "africa-cup-coed",
    slug: "africa-cup-coed-summer-2026",
    name: "Summer 2026",
    startDate: "2026-06-06",
    endDate: "2026-08-08",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-05-22T23:59:59Z",
    priceCents: 79500,
    maxParticipants: 8,
    scheduleNotes: "7v7 Express, coed. Saturdays 9–11pm.",
  },
  {
    programSlug: "africa-cup-late",
    slug: "africa-cup-late-summer-2026",
    name: "Summer 2026",
    startDate: "2026-06-06",
    endDate: "2026-08-08",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-05-29T23:59:59Z",
    priceCents: 79500,
    maxParticipants: 6,
    scheduleNotes: "7v7 Express, late-night. Saturdays 11pm–1am.",
  },
  {
    programSlug: "asia-cup-mens",
    slug: "asia-cup-mens-summer-2026",
    name: "Summer 2026",
    startDate: "2026-06-07",
    endDate: "2026-08-09",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-05-22T23:59:59Z",
    priceCents: 79500,
    maxParticipants: 16,
    scheduleNotes: "7v7 Express. Sundays 9am–1pm.",
  },

  // Worthington off-peak fillers (multiple cycles per summer)
  {
    programSlug: "walking-soccer-50",
    slug: "walking-soccer-50-summer-2026",
    name: "Summer 2026 (8 weeks)",
    startDate: "2026-06-08",
    endDate: "2026-08-02",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-06-08T08:00:00Z",
    priceCents: 9900,
    maxParticipants: 30,
    scheduleNotes: "M/W/F 8–9am. Walking soccer for adults 50+.",
  },
  {
    programSlug: "mom-and-tot",
    slug: "mom-and-tot-summer-2026",
    name: "Summer 2026 (6 weeks)",
    startDate: "2026-06-09",
    endDate: "2026-07-23",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-06-09T09:00:00Z",
    priceCents: 9900,
    maxParticipants: 20,
    scheduleNotes: "T/Th 9am. Walk-in $25 also available; package $99 covers 6 weeks.",
  },
  {
    programSlug: "skills-6-9",
    slug: "skills-6-9-summer-cycle1-2026",
    name: "Summer 2026 — Cycle 1",
    startDate: "2026-06-08",
    endDate: "2026-07-03",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-06-08T15:00:00Z",
    priceCents: 14900,
    maxParticipants: 20,
    scheduleNotes: "M–F 3pm. 4-week cycle.",
  },
  {
    programSlug: "skills-6-9",
    slug: "skills-6-9-summer-cycle2-2026",
    name: "Summer 2026 — Cycle 2",
    startDate: "2026-07-13",
    endDate: "2026-08-07",
    registrationOpens: "2026-06-15T00:00:00Z",
    registrationCloses: "2026-07-13T15:00:00Z",
    priceCents: 14900,
    maxParticipants: 20,
    scheduleNotes: "M–F 3pm. 4-week cycle.",
  },
  {
    programSlug: "skills-10-12",
    slug: "skills-10-12-summer-cycle1-2026",
    name: "Summer 2026 — Cycle 1",
    startDate: "2026-06-08",
    endDate: "2026-07-03",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-06-08T16:00:00Z",
    priceCents: 14900,
    maxParticipants: 20,
    scheduleNotes: "M–F 4pm. 4-week cycle.",
  },
  {
    programSlug: "skills-10-12",
    slug: "skills-10-12-summer-cycle2-2026",
    name: "Summer 2026 — Cycle 2",
    startDate: "2026-07-13",
    endDate: "2026-08-07",
    registrationOpens: "2026-06-15T00:00:00Z",
    registrationCloses: "2026-07-13T16:00:00Z",
    priceCents: 14900,
    maxParticipants: 20,
    scheduleNotes: "M–F 4pm. 4-week cycle.",
  },
  {
    programSlug: "skills-13-plus",
    slug: "skills-13-plus-summer-cycle1-2026",
    name: "Summer 2026 — Cycle 1",
    startDate: "2026-06-08",
    endDate: "2026-07-03",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-06-08T17:00:00Z",
    priceCents: 14900,
    maxParticipants: 20,
    scheduleNotes: "M–F 5pm academy. 4-week cycle.",
  },
  {
    programSlug: "skills-13-plus",
    slug: "skills-13-plus-summer-cycle2-2026",
    name: "Summer 2026 — Cycle 2",
    startDate: "2026-07-13",
    endDate: "2026-08-07",
    registrationOpens: "2026-06-15T00:00:00Z",
    registrationCloses: "2026-07-13T17:00:00Z",
    priceCents: 14900,
    maxParticipants: 20,
    scheduleNotes: "M–F 5pm academy. 4-week cycle.",
  },
  {
    programSlug: "goalkeeper-academy",
    slug: "goalkeeper-academy-summer-2026",
    name: "Summer 2026 (4 weeks)",
    startDate: "2026-06-14",
    endDate: "2026-07-05",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-06-14T11:00:00Z",
    priceCents: 19900,
    maxParticipants: 16,
    scheduleNotes: "Sundays 11am–1pm. 4-week premium specialty.",
  },
  {
    programSlug: "youth-summer-4v4",
    slug: "youth-summer-4v4-summer-2026",
    name: "Summer 2026",
    startDate: "2026-06-09",
    endDate: "2026-07-30",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-06-08T17:00:00Z",
    priceCents: 12900,
    maxParticipants: 80,
    scheduleNotes: "T/Th 5–7pm. Per-player league for U10/U12/U14.",
  },
  {
    programSlug: "heritage-youth-saturday",
    slug: "heritage-youth-saturday-summer-2026",
    name: "Summer 2026",
    startDate: "2026-06-06",
    endDate: "2026-08-08",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-06-05T18:00:00Z",
    priceCents: 14900,
    maxParticipants: 60,
    scheduleNotes: "Saturdays 9am–1pm. 5v5 mixed youth with cultural-celebration weeks.",
  },

  // Worthington summer day camps — one season per themed week
  {
    programSlug: "camp-skills",
    slug: "camp-skills-week1-2026",
    name: "Week 1 — Skills (Jun 9–13)",
    startDate: "2026-06-09",
    endDate: "2026-06-13",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-06-08T17:00:00Z",
    priceCents: 32500,
    maxParticipants: 40,
    scheduleNotes: "Mon–Fri 9am–4pm full-day camp. Half-day option $195/wk.",
  },
  {
    programSlug: "camp-world-cup",
    slug: "camp-world-cup-week2-2026",
    name: "Week 2 — World Cup (Jun 16–20)",
    startDate: "2026-06-16",
    endDate: "2026-06-20",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-06-15T17:00:00Z",
    priceCents: 32500,
    maxParticipants: 40,
    scheduleNotes: "Mon–Fri 9am–4pm. Each kid drafted to a country, World Cup mini-tournament Friday.",
  },
  {
    programSlug: "camp-goalkeeper",
    slug: "camp-goalkeeper-week3-2026",
    name: "Week 3 — Goalkeeper (Jun 22–26)",
    startDate: "2026-06-22",
    endDate: "2026-06-26",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-06-21T17:00:00Z",
    priceCents: 39500,
    maxParticipants: 24,
    scheduleNotes: "Mon–Fri 9am–4pm. Specialty week, premium pricing.",
  },
  {
    programSlug: "camp-star-player",
    slug: "camp-star-player-week4-2026",
    name: "Week 4 — Star Player (Jun 29–Jul 3, 4 days)",
    startDate: "2026-06-29",
    endDate: "2026-07-02",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-06-28T17:00:00Z",
    priceCents: 26000,
    maxParticipants: 40,
    scheduleNotes: "Mon–Thu 9am–4pm (skip July 3 + 4). Each day a different international star.",
  },
  {
    programSlug: "camp-speed-agility",
    slug: "camp-speed-agility-week5-2026",
    name: "Week 5 — Speed & Agility (Jul 7–11)",
    startDate: "2026-07-07",
    endDate: "2026-07-11",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-07-06T17:00:00Z",
    priceCents: 32500,
    maxParticipants: 40,
    scheduleNotes: "Mon–Fri 9am–4pm. Athletic-development focus.",
  },
  {
    programSlug: "camp-tournament-prep",
    slug: "camp-tournament-prep-week6-2026",
    name: "Week 6 — Tournament Prep (Jul 14–18)",
    startDate: "2026-07-14",
    endDate: "2026-07-18",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-07-13T17:00:00Z",
    priceCents: 32500,
    maxParticipants: 40,
    scheduleNotes: "Mon–Fri 9am–4pm. Friday-night-lights mini-tournament finale.",
  },
  {
    programSlug: "camp-heritage",
    slug: "camp-heritage-week7-2026",
    name: "Week 7 — Heritage (Jul 21–25)",
    startDate: "2026-07-21",
    endDate: "2026-07-25",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-07-20T17:00:00Z",
    priceCents: 32500,
    maxParticipants: 40,
    scheduleNotes:
      "Mon–Fri 9am–4pm. Each day spotlights a region's soccer culture with food, music, history.",
  },
  {
    programSlug: "camp-skills-showcase",
    slug: "camp-skills-showcase-week8-2026",
    name: "Week 8 — Skills Showcase (Jul 28–Aug 1)",
    startDate: "2026-07-28",
    endDate: "2026-08-01",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-07-27T17:00:00Z",
    priceCents: 32500,
    maxParticipants: 40,
    scheduleNotes:
      "Mon–Fri 9am–4pm. College coaches invited Friday for HS-aged showcase.",
  },

  // Downtown summer leagues
  {
    programSlug: "do-coed-standard",
    slug: "do-coed-standard-summer-2026",
    name: "Summer 2026",
    startDate: "2026-06-02",
    endDate: "2026-08-06",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-05-22T23:59:59Z",
    priceCents: 105000,
    maxParticipants: 12,
    scheduleNotes: "6v6 7-game + playoffs. Tuesdays + Thursdays 7–10pm at Downtown.",
  },
  {
    programSlug: "do-happy-hour-express",
    slug: "do-happy-hour-express-summer-2026",
    name: "Summer 2026",
    startDate: "2026-06-01",
    endDate: "2026-08-05",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-05-22T23:59:59Z",
    priceCents: 69500,
    maxParticipants: 16,
    scheduleNotes: "5v5 Express, 25-min × 4 teams/hr. Mon + Wed 5–7pm.",
  },
  {
    programSlug: "do-late-express",
    slug: "do-late-express-summer-2026",
    name: "Summer 2026",
    startDate: "2026-06-01",
    endDate: "2026-08-06",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-05-22T23:59:59Z",
    priceCents: 69500,
    maxParticipants: 12,
    scheduleNotes: "5v5 Express. Mon + Thu 9–11pm.",
  },
  {
    programSlug: "do-osu-pickup",
    slug: "do-osu-pickup-summer-2026",
    name: "Summer 2026 (rolling)",
    startDate: "2026-06-01",
    endDate: "2026-09-07",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-09-07T18:00:00Z",
    priceCents: 4000,
    scheduleNotes:
      "Sundays 4–7pm. $40/month unlimited membership; single drop-in $15 priced separately as one-off.",
  },
  {
    programSlug: "do-lunch-league",
    slug: "do-lunch-league-summer-2026",
    name: "Summer 2026 (4-week pass)",
    startDate: "2026-06-01",
    endDate: "2026-08-31",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-08-31T11:00:00Z",
    priceCents: 8900,
    scheduleNotes: "M–F 12–1pm. 45-min Express, self-officiated, BYO uniform.",
  },
  {
    programSlug: "do-greek-im",
    slug: "do-greek-im-summer-2026",
    name: "Summer 2026 (limited — OSU summer-session only)",
    startDate: "2026-06-13",
    endDate: "2026-08-08",
    registrationOpens: "2026-05-15T00:00:00Z",
    registrationCloses: "2026-06-12T18:00:00Z",
    priceCents: 79500,
    maxParticipants: 8,
    scheduleNotes: "Fridays 4–7pm. 5v5 fraternity / IM teams. Volume discount available.",
  },
  {
    programSlug: "liga-latina-friday",
    slug: "liga-latina-friday-summer-2026",
    name: "Summer 2026",
    startDate: "2026-06-05",
    endDate: "2026-08-07",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-05-29T23:59:59Z",
    priceCents: 69500,
    maxParticipants: 16,
    scheduleNotes: "5v5 Express. Fridays 6–10pm.",
  },
  {
    programSlug: "liga-latina-friday-late",
    slug: "liga-latina-friday-late-summer-2026",
    name: "Summer 2026",
    startDate: "2026-06-05",
    endDate: "2026-08-07",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-05-29T23:59:59Z",
    priceCents: 69500,
    maxParticipants: 6,
    scheduleNotes: "5v5 Express, late-night. Fridays 11pm–1am.",
  },
  {
    programSlug: "africa-cup-express-down",
    slug: "africa-cup-express-down-summer-2026",
    name: "Summer 2026",
    startDate: "2026-06-03",
    endDate: "2026-08-05",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-05-29T23:59:59Z",
    priceCents: 69500,
    maxParticipants: 12,
    scheduleNotes: "5v5 Express. Wednesdays 8pm–12am.",
  },
  {
    programSlug: "asia-cup-friday-late",
    slug: "asia-cup-friday-late-summer-2026",
    name: "Summer 2026",
    startDate: "2026-06-05",
    endDate: "2026-08-07",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-05-29T23:59:59Z",
    priceCents: 69500,
    maxParticipants: 12,
    scheduleNotes: "5v5 Express, post-Maghrib full window. Fridays 9pm–1am.",
  },
  {
    programSlug: "do-friday-after-bar",
    slug: "do-friday-after-bar-summer-2026",
    name: "Summer 2026",
    startDate: "2026-06-05",
    endDate: "2026-08-07",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-05-29T23:59:59Z",
    priceCents: 69500,
    maxParticipants: 12,
    scheduleNotes: "5v5 Express social with beer garden. Fridays 11pm–1am.",
  },
  {
    programSlug: "do-free-agent",
    slug: "do-free-agent-summer-2026",
    name: "Summer 2026",
    startDate: "2026-06-01",
    endDate: "2026-08-08",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-05-29T23:59:59Z",
    priceCents: 12900,
    scheduleNotes: "$129/player house-team placement on a Downtown league.",
  },

  // Summer tournaments — one season per event
  {
    programSlug: "memorial-day-premier",
    slug: "memorial-day-premier-2026",
    name: "May 23–25, 2026",
    startDate: "2026-05-23",
    endDate: "2026-05-25",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-05-22T18:00:00Z",
    priceCents: 29500,
    maxParticipants: 52,
    scheduleNotes:
      "Youth at Worthington Sat. Adult coed 4v4 at Downtown Sun. Adult premier at Downtown Mon late. " +
      "Pricing varies by division (defaulted to coed 4v4 here; see admin for premier $395 variant).",
  },
  {
    programSlug: "eid-al-adha-cup",
    slug: "eid-al-adha-cup-2026",
    name: "May 27–30, 2026",
    startDate: "2026-05-27",
    endDate: "2026-05-30",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-05-26T18:00:00Z",
    priceCents: 34500,
    maxParticipants: 24,
    scheduleNotes:
      "16-team men's open + 8-team Masters 35+ ($295). 7v7 Express. Final at Worthington Sat.",
  },
  {
    programSlug: "liga-latina-kickoff-cup",
    slug: "liga-latina-kickoff-cup-2026",
    name: "May 30, 2026",
    startDate: "2026-05-30",
    endDate: "2026-05-30",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-05-29T18:00:00Z",
    priceCents: 29500,
    maxParticipants: 28,
    scheduleNotes: "16-team adult coed 5v5 + 12-team men's open ($345). Downtown.",
  },
  {
    programSlug: "fourth-of-july-express",
    slug: "fourth-of-july-express-2026",
    name: "July 3, 2026",
    startDate: "2026-07-03",
    endDate: "2026-07-03",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-07-02T18:00:00Z",
    priceCents: 19500,
    maxParticipants: 12,
    scheduleNotes: "12-team adult coed 5v5 Express. Downtown. Patriotic theming + late-night DJ.",
  },
  {
    programSlug: "africa-cup-mid-summer",
    slug: "africa-cup-mid-summer-2026",
    name: "July 18–19, 2026",
    startDate: "2026-07-18",
    endDate: "2026-07-19",
    registrationOpens: "2026-05-04T00:00:00Z",
    registrationCloses: "2026-07-17T18:00:00Z",
    priceCents: 34500,
    maxParticipants: 24,
    scheduleNotes:
      "16-team men's open + 8-team coed. 7v7 Express. Worthington Saturday + Downtown Sunday.",
  },
  {
    programSlug: "continental-cup-final",
    slug: "continental-cup-final-2026",
    name: "August 22–23, 2026",
    startDate: "2026-08-22",
    endDate: "2026-08-23",
    registrationOpens: "2026-08-09T00:00:00Z",
    registrationCloses: "2026-08-21T18:00:00Z",
    priceCents: 0,
    maxParticipants: 3,
    scheduleNotes:
      "Free for participating champions (Liga Latina, Africa Cup, Asia Cup). " +
      "Worthington Saturday group stage + Heritage Youth showcase, Downtown Sunday final.",
  },
];

const FALL_2026_SEASONS: SeasonDef[] = [
  // Matched-Resolute lineup (20 leagues) + Free Agent — fall season Sep 8 → Dec 13
  ...MATCHED_RESOLUTE_LEAGUES.map((programSlug) => ({
    programSlug,
    slug: `${programSlug}-fall-2026`,
    name: "Fall 2026",
    startDate: "2026-09-08",
    endDate: "2026-12-13",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-09-04T23:59:59Z",
    priceCents: 105000,
    maxParticipants: 8,
    scheduleNotes: "8-game regular season + 1–2 playoff weeks. 6v6 indoor.",
  })),
  {
    programSlug: "wo-free-agent",
    slug: "wo-free-agent-fall-2026",
    name: "Fall 2026",
    startDate: "2026-09-08",
    endDate: "2026-12-13",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-09-04T23:59:59Z",
    priceCents: 12900,
    scheduleNotes: "$129/player house-team placement on a Worthington matched league.",
  },

  // Community leagues continue through fall
  {
    programSlug: "liga-latina-hombres",
    slug: "liga-latina-hombres-fall-2026",
    name: "Fall 2026",
    startDate: "2026-09-13",
    endDate: "2026-12-13",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-09-08T23:59:59Z",
    priceCents: 79500,
    maxParticipants: 16,
    scheduleNotes: "7v7 Express. Sundays 1–5pm.",
  },
  {
    programSlug: "liga-latina-mixta",
    slug: "liga-latina-mixta-fall-2026",
    name: "Fall 2026",
    startDate: "2026-09-13",
    endDate: "2026-12-13",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-09-08T23:59:59Z",
    priceCents: 79500,
    maxParticipants: 16,
    scheduleNotes: "7v7 Express, coed. Sundays 5–9pm.",
  },
  {
    programSlug: "liga-latina-late",
    slug: "liga-latina-late-fall-2026",
    name: "Fall 2026",
    startDate: "2026-09-12",
    endDate: "2026-12-12",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-09-08T23:59:59Z",
    priceCents: 79500,
    maxParticipants: 6,
    scheduleNotes: "7v7 Express, late-night. Saturdays 10pm–12am.",
  },
  {
    programSlug: "africa-cup-mens",
    slug: "africa-cup-mens-fall-2026",
    name: "Fall 2026",
    startDate: "2026-09-12",
    endDate: "2026-12-12",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-09-08T23:59:59Z",
    priceCents: 79500,
    maxParticipants: 16,
    scheduleNotes: "7v7 Express. Saturdays 5–9pm.",
  },
  {
    programSlug: "africa-cup-coed",
    slug: "africa-cup-coed-fall-2026",
    name: "Fall 2026",
    startDate: "2026-09-12",
    endDate: "2026-12-12",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-09-08T23:59:59Z",
    priceCents: 79500,
    maxParticipants: 8,
    scheduleNotes: "7v7 Express, coed. Saturdays 9–11pm.",
  },
  {
    programSlug: "africa-cup-late",
    slug: "africa-cup-late-fall-2026",
    name: "Fall 2026",
    startDate: "2026-09-12",
    endDate: "2026-12-12",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-09-08T23:59:59Z",
    priceCents: 79500,
    maxParticipants: 6,
    scheduleNotes: "7v7 Express, late-night. Saturdays 11pm–1am.",
  },
  {
    programSlug: "asia-cup-mens",
    slug: "asia-cup-mens-fall-2026",
    name: "Fall 2026",
    startDate: "2026-09-13",
    endDate: "2026-12-13",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-09-08T23:59:59Z",
    priceCents: 79500,
    maxParticipants: 16,
    scheduleNotes: "7v7 Express. Sundays 9am–1pm.",
  },

  // Worthington off-peak fillers continue
  {
    programSlug: "walking-soccer-50",
    slug: "walking-soccer-50-fall-2026",
    name: "Fall 2026 (8 weeks)",
    startDate: "2026-09-08",
    endDate: "2026-11-02",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-09-08T08:00:00Z",
    priceCents: 9900,
    maxParticipants: 30,
    scheduleNotes: "M/W/F 8–9am.",
  },
  {
    programSlug: "mom-and-tot",
    slug: "mom-and-tot-fall-2026",
    name: "Fall 2026 (6 weeks)",
    startDate: "2026-09-08",
    endDate: "2026-10-22",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-09-08T09:00:00Z",
    priceCents: 9900,
    maxParticipants: 20,
    scheduleNotes: "T/Th 9am.",
  },
  {
    programSlug: "skills-6-9",
    slug: "skills-6-9-fall-cycle1-2026",
    name: "Fall 2026 — Cycle 1",
    startDate: "2026-09-08",
    endDate: "2026-10-03",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-09-08T15:00:00Z",
    priceCents: 14900,
    maxParticipants: 20,
    scheduleNotes: "M–F 3pm. 4-week cycle.",
  },
  {
    programSlug: "skills-6-9",
    slug: "skills-6-9-fall-cycle2-2026",
    name: "Fall 2026 — Cycle 2",
    startDate: "2026-10-13",
    endDate: "2026-11-07",
    registrationOpens: "2026-09-15T00:00:00Z",
    registrationCloses: "2026-10-13T15:00:00Z",
    priceCents: 14900,
    maxParticipants: 20,
    scheduleNotes: "M–F 3pm. 4-week cycle.",
  },
  {
    programSlug: "skills-10-12",
    slug: "skills-10-12-fall-cycle1-2026",
    name: "Fall 2026 — Cycle 1",
    startDate: "2026-09-08",
    endDate: "2026-10-03",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-09-08T16:00:00Z",
    priceCents: 14900,
    maxParticipants: 20,
    scheduleNotes: "M–F 4pm. 4-week cycle.",
  },
  {
    programSlug: "skills-10-12",
    slug: "skills-10-12-fall-cycle2-2026",
    name: "Fall 2026 — Cycle 2",
    startDate: "2026-10-13",
    endDate: "2026-11-07",
    registrationOpens: "2026-09-15T00:00:00Z",
    registrationCloses: "2026-10-13T16:00:00Z",
    priceCents: 14900,
    maxParticipants: 20,
    scheduleNotes: "M–F 4pm. 4-week cycle.",
  },
  {
    programSlug: "skills-13-plus",
    slug: "skills-13-plus-fall-cycle1-2026",
    name: "Fall 2026 — Cycle 1",
    startDate: "2026-09-08",
    endDate: "2026-10-03",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-09-08T17:00:00Z",
    priceCents: 14900,
    maxParticipants: 20,
    scheduleNotes: "M–F 5pm academy. 4-week cycle.",
  },
  {
    programSlug: "skills-13-plus",
    slug: "skills-13-plus-fall-cycle2-2026",
    name: "Fall 2026 — Cycle 2",
    startDate: "2026-10-13",
    endDate: "2026-11-07",
    registrationOpens: "2026-09-15T00:00:00Z",
    registrationCloses: "2026-10-13T17:00:00Z",
    priceCents: 14900,
    maxParticipants: 20,
    scheduleNotes: "M–F 5pm academy. 4-week cycle.",
  },
  {
    programSlug: "goalkeeper-academy",
    slug: "goalkeeper-academy-fall-2026",
    name: "Fall 2026 (4 weeks)",
    startDate: "2026-09-13",
    endDate: "2026-10-04",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-09-13T11:00:00Z",
    priceCents: 19900,
    maxParticipants: 16,
    scheduleNotes: "Sundays 11am–1pm.",
  },

  // Fall-only youth + HS programs
  {
    programSlug: "youth-fall-rec-u8",
    slug: "youth-fall-rec-u8-2026",
    name: "Fall 2026",
    startDate: "2026-09-12",
    endDate: "2026-12-05",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-09-05T18:00:00Z",
    priceCents: 24900,
    maxParticipants: 60,
    scheduleNotes: "4v4 Saturday rec league. Worthington.",
  },
  {
    programSlug: "youth-fall-rec-u10",
    slug: "youth-fall-rec-u10-2026",
    name: "Fall 2026",
    startDate: "2026-09-12",
    endDate: "2026-12-05",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-09-05T18:00:00Z",
    priceCents: 24900,
    maxParticipants: 60,
    scheduleNotes: "5v5 Saturday rec league. Worthington.",
  },
  {
    programSlug: "youth-fall-rec-u12",
    slug: "youth-fall-rec-u12-2026",
    name: "Fall 2026",
    startDate: "2026-09-12",
    endDate: "2026-12-05",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-09-05T18:00:00Z",
    priceCents: 24900,
    maxParticipants: 60,
    scheduleNotes: "5v5 Saturday rec league. Worthington.",
  },
  {
    programSlug: "youth-fall-rec-u14",
    slug: "youth-fall-rec-u14-2026",
    name: "Fall 2026",
    startDate: "2026-09-12",
    endDate: "2026-12-05",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-09-05T18:00:00Z",
    priceCents: 24900,
    maxParticipants: 60,
    scheduleNotes: "5v5 Saturday rec league. Worthington.",
  },
  {
    programSlug: "hs-coed-saturday",
    slug: "hs-coed-saturday-fall-2026",
    name: "Fall 2026",
    startDate: "2026-09-12",
    endDate: "2026-12-05",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-09-05T18:00:00Z",
    priceCents: 12900,
    maxParticipants: 60,
    scheduleNotes: "HS coed Saturday league. Worthington.",
  },

  // Downtown fall leagues
  {
    programSlug: "do-coed-standard",
    slug: "do-coed-standard-fall-2026",
    name: "Fall 2026",
    startDate: "2026-09-08",
    endDate: "2026-12-10",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-09-04T23:59:59Z",
    priceCents: 105000,
    maxParticipants: 12,
    scheduleNotes: "6v6 8-game + playoffs. Tuesdays + Thursdays 7–10pm.",
  },
  {
    programSlug: "do-happy-hour-express",
    slug: "do-happy-hour-express-fall-2026",
    name: "Fall 2026",
    startDate: "2026-09-07",
    endDate: "2026-12-09",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-09-04T23:59:59Z",
    priceCents: 69500,
    maxParticipants: 16,
    scheduleNotes: "5v5 Express. Mon + Wed 5–7pm.",
  },
  {
    programSlug: "do-late-express",
    slug: "do-late-express-fall-2026",
    name: "Fall 2026",
    startDate: "2026-09-07",
    endDate: "2026-12-10",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-09-04T23:59:59Z",
    priceCents: 69500,
    maxParticipants: 12,
    scheduleNotes: "5v5 Express. Mon + Thu 9–11pm.",
  },
  {
    programSlug: "do-osu-pickup",
    slug: "do-osu-pickup-fall-2026",
    name: "Fall 2026 (rolling)",
    startDate: "2026-09-08",
    endDate: "2026-12-13",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-12-13T18:00:00Z",
    priceCents: 4000,
    scheduleNotes: "Sundays 4–7pm. $40/month membership.",
  },
  {
    programSlug: "do-lunch-league",
    slug: "do-lunch-league-fall-2026",
    name: "Fall 2026",
    startDate: "2026-09-08",
    endDate: "2026-12-11",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-12-11T11:00:00Z",
    priceCents: 8900,
    scheduleNotes: "M–F 12–1pm. 45-min Express, self-officiated.",
  },
  {
    programSlug: "do-greek-im",
    slug: "do-greek-im-fall-2026",
    name: "Fall 2026 (full OSU semester)",
    startDate: "2026-09-12",
    endDate: "2026-12-12",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-09-08T18:00:00Z",
    priceCents: 79500,
    maxParticipants: 12,
    scheduleNotes: "Fridays 4–7pm. Full OSU semester runs longer than summer pilot.",
  },
  {
    programSlug: "liga-latina-friday",
    slug: "liga-latina-friday-fall-2026",
    name: "Fall 2026",
    startDate: "2026-09-11",
    endDate: "2026-12-11",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-09-08T23:59:59Z",
    priceCents: 69500,
    maxParticipants: 16,
    scheduleNotes: "5v5 Express. Fridays 6–10pm.",
  },
  {
    programSlug: "liga-latina-friday-late",
    slug: "liga-latina-friday-late-fall-2026",
    name: "Fall 2026",
    startDate: "2026-09-11",
    endDate: "2026-12-11",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-09-08T23:59:59Z",
    priceCents: 69500,
    maxParticipants: 6,
    scheduleNotes: "5v5 Express, late-night. Fridays 11pm–1am.",
  },
  {
    programSlug: "africa-cup-express-down",
    slug: "africa-cup-express-down-fall-2026",
    name: "Fall 2026",
    startDate: "2026-09-09",
    endDate: "2026-12-09",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-09-08T23:59:59Z",
    priceCents: 69500,
    maxParticipants: 12,
    scheduleNotes: "5v5 Express. Wednesdays 8pm–12am.",
  },
  {
    programSlug: "asia-cup-friday-late",
    slug: "asia-cup-friday-late-fall-2026",
    name: "Fall 2026",
    startDate: "2026-09-11",
    endDate: "2026-12-11",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-09-08T23:59:59Z",
    priceCents: 69500,
    maxParticipants: 12,
    scheduleNotes: "5v5 Express. Fridays 9pm–1am.",
  },
  {
    programSlug: "do-friday-after-bar",
    slug: "do-friday-after-bar-fall-2026",
    name: "Fall 2026",
    startDate: "2026-09-11",
    endDate: "2026-12-11",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-09-08T23:59:59Z",
    priceCents: 69500,
    maxParticipants: 12,
    scheduleNotes: "5v5 Express social with beer garden. Fridays 11pm–1am.",
  },
  {
    programSlug: "do-corporate",
    slug: "do-corporate-fall-2026",
    name: "Fall 2026",
    startDate: "2026-09-14",
    endDate: "2026-12-08",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-09-12T18:00:00Z",
    priceCents: 149500,
    maxParticipants: 8,
    scheduleNotes: "6v6 corporate league. Mon + Tue 9–10pm. JPMC, Nationwide, Cardinal Health, Big 4.",
  },
  {
    programSlug: "do-free-agent",
    slug: "do-free-agent-fall-2026",
    name: "Fall 2026",
    startDate: "2026-09-08",
    endDate: "2026-12-12",
    registrationOpens: "2026-08-24T00:00:00Z",
    registrationCloses: "2026-09-08T23:59:59Z",
    priceCents: 12900,
    scheduleNotes: "$129/player house-team placement on a Downtown league.",
  },

  // Fall tournaments — per programming-plan §6 seasonality
  {
    programSlug: "halloween-cup",
    slug: "halloween-cup-2026",
    name: "October 31 – November 1, 2026",
    startDate: "2026-10-31",
    endDate: "2026-11-01",
    registrationOpens: "2026-09-15T00:00:00Z",
    registrationCloses: "2026-10-30T18:00:00Z",
    priceCents: 29500,
    maxParticipants: 24,
    scheduleNotes: "Halloween-themed tournament. Adult + youth divisions. Costume optional.",
  },
  {
    programSlug: "turkey-bowl",
    slug: "turkey-bowl-2026",
    name: "November 21–22, 2026",
    startDate: "2026-11-21",
    endDate: "2026-11-22",
    registrationOpens: "2026-10-15T00:00:00Z",
    registrationCloses: "2026-11-20T18:00:00Z",
    priceCents: 29500,
    maxParticipants: 24,
    scheduleNotes: "Thanksgiving-week tournament. Adult coed + youth families.",
  },
  {
    programSlug: "holiday-cup",
    slug: "holiday-cup-2026",
    name: "December 19, 2026",
    startDate: "2026-12-19",
    endDate: "2026-12-19",
    registrationOpens: "2026-11-15T00:00:00Z",
    registrationCloses: "2026-12-18T18:00:00Z",
    priceCents: 19500,
    maxParticipants: 12,
    scheduleNotes: "Single-day social tournament. Adult coed only. Festive theming.",
  },
];

const ALL_SEASONS: SeasonDef[] = [...SUMMER_2026_SEASONS, ...FALL_2026_SEASONS];

// ────────────────────────────────────────────────────────────────────────────
// Seed runner
// ────────────────────────────────────────────────────────────────────────────

async function seedLaunch2026() {
  const db = getDb();

  console.log("🌱 Seeding launch catalog (Summer + Fall 2026)...\n");

  // 1. Organizations (idempotent upsert by slug)
  console.log("1. Organizations...");
  for (const orgDef of [SOCCERONE_ORG, ASPIRE_HQ_ORG]) {
    const [existing] = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.slug, orgDef.slug))
      .limit(1);
    if (existing) {
      console.log(`   • ${orgDef.slug} already exists`);
    } else {
      const [inserted] = await db.insert(organizations).values(orgDef).returning({ id: organizations.id });
      console.log(`   ✓ ${orgDef.slug} created (${inserted.id})`);
    }
  }

  const [soccerOneOrg] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, "soccerone"));
  if (!soccerOneOrg) throw new Error("soccerone org not found after upsert");

  // 2. Admin user (idempotent by email; password unset — sign in via magic link)
  console.log("\n2. Admin user...");
  const [existingAdmin] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, ADMIN_USER.email))
    .limit(1);

  let adminId: string;
  if (existingAdmin) {
    adminId = existingAdmin.id;
    console.log(`   • ${ADMIN_USER.email} already exists`);
  } else {
    // Set a random unguessable password; admin will reset via magic link.
    const tempPasswordHash = await hashPassword(
      `seed-temp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    const [inserted] = await db
      .insert(users)
      .values({
        email: ADMIN_USER.email,
        firstName: ADMIN_USER.firstName,
        lastName: ADMIN_USER.lastName,
        passwordHash: tempPasswordHash,
        emailVerified: true,
      })
      .returning({ id: users.id });
    adminId = inserted.id;
    console.log(`   ✓ ${ADMIN_USER.email} created (${adminId})`);
    console.log(`     (temp password set; reset via magic link to access)`);
  }

  // Bind super_admin role globally. Roles are global (no org column);
  // org-scoping for non-super-admin roles uses userRoles.scopeType +
  // scopeId. super_admin is global by definition.
  const [superAdminRole] = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "super_admin"))
    .limit(1);
  if (superAdminRole) {
    const [existingBinding] = await db
      .select({ userId: userRoles.userId })
      .from(userRoles)
      .where(and(eq(userRoles.userId, adminId), eq(userRoles.roleId, superAdminRole.id)))
      .limit(1);
    if (!existingBinding) {
      await db.insert(userRoles).values({
        userId: adminId,
        roleId: superAdminRole.id,
        scopeType: "global",
      });
      console.log(`   ✓ ${ADMIN_USER.email} bound as super_admin (global)`);
    } else {
      console.log(`   • ${ADMIN_USER.email} already super_admin`);
    }
  } else {
    console.log(
      `   ⚠ super_admin role row not found. Roles are seeded as part of the` +
        ` initial migrations — confirm migrations have applied.`,
    );
  }

  // 3. Sport (per-organization — sports.organization_id is non-null)
  console.log("\n3. Sport...");
  const [existingSport] = await db
    .select({ id: sports.id })
    .from(sports)
    .where(and(eq(sports.organizationId, soccerOneOrg.id), eq(sports.slug, SOCCER_SPORT.slug)))
    .limit(1);
  let sportId: string;
  if (existingSport) {
    sportId = existingSport.id;
    console.log(`   • soccer already exists`);
  } else {
    const [inserted] = await db
      .insert(sports)
      .values({ ...SOCCER_SPORT, organizationId: soccerOneOrg.id })
      .returning({ id: sports.id });
    sportId = inserted.id;
    console.log(`   ✓ soccer created (${sportId})`);
  }

  // 4. Locations
  console.log("\n4. Locations...");
  const locationIdBySlug: Record<string, string> = {};
  for (const locDef of [WORTHINGTON_LOCATION, DOWNTOWN_LOCATION]) {
    const [existing] = await db
      .select({ id: locations.id })
      .from(locations)
      .where(and(eq(locations.organizationId, soccerOneOrg.id), eq(locations.slug, locDef.slug)))
      .limit(1);
    if (existing) {
      locationIdBySlug[locDef.slug] = existing.id;
      console.log(`   • ${locDef.slug} already exists`);
    } else {
      const [inserted] = await db
        .insert(locations)
        .values({ ...locDef, organizationId: soccerOneOrg.id })
        .returning({ id: locations.id });
      locationIdBySlug[locDef.slug] = inserted.id;
      console.log(`   ✓ ${locDef.slug} created (${inserted.id})`);
    }
  }

  // 5. Venues — schema has no slug; uniqueness is by (locationId, name).
  console.log("\n5. Venues...");
  const venuesByLocation: Record<string, typeof WORTHINGTON_VENUES> = {
    worthington: WORTHINGTON_VENUES,
    downtown: DOWNTOWN_VENUES,
  };
  for (const [locSlug, venueDefs] of Object.entries(venuesByLocation)) {
    const locationId = locationIdBySlug[locSlug];
    if (!locationId) continue;
    for (const venueDef of venueDefs) {
      const [existing] = await db
        .select({ id: venues.id })
        .from(venues)
        .where(and(eq(venues.locationId, locationId), eq(venues.name, venueDef.name)))
        .limit(1);
      if (existing) {
        console.log(`   • ${locSlug}/${venueDef.name} already exists`);
      } else {
        await db.insert(venues).values({
          ...venueDef,
          locationId,
        });
        console.log(`   ✓ ${locSlug}/${venueDef.name} created`);
      }
    }
  }

  // 6. Age groups — schema has no slug; uniqueness is by (organizationId, name).
  console.log("\n6. Age groups...");
  const ageGroupIdByKey: Record<string, string> = {};
  for (const ag of AGE_GROUPS) {
    const [existing] = await db
      .select({ id: ageGroups.id })
      .from(ageGroups)
      .where(and(eq(ageGroups.organizationId, soccerOneOrg.id), eq(ageGroups.name, ag.name)))
      .limit(1);
    if (existing) {
      ageGroupIdByKey[ag.key] = existing.id;
    } else {
      const [inserted] = await db
        .insert(ageGroups)
        .values({
          organizationId: soccerOneOrg.id,
          name: ag.name,
          minAge: ag.minAge,
          maxAge: ag.maxAge,
          description: ag.description,
        })
        .returning({ id: ageGroups.id });
      ageGroupIdByKey[ag.key] = inserted.id;
    }
  }
  console.log(`   ✓ ${AGE_GROUPS.length} age groups upserted`);

  // 7. Programs (active=true; ageGroup lives on the season, not the program)
  console.log("\n7. Programs...");
  const programIdBySlug: Record<string, string> = {};
  const programDefaultAgeGroupKey: Record<string, string | undefined> = {};
  for (const progDef of PROGRAMS) {
    const locationId = locationIdBySlug[progDef.locationSlug];
    if (!locationId) {
      console.warn(`   ⚠ skipping ${progDef.slug} — location ${progDef.locationSlug} not found`);
      continue;
    }
    programDefaultAgeGroupKey[progDef.slug] = progDef.defaultAgeGroupKey;
    const [existing] = await db
      .select({ id: programs.id })
      .from(programs)
      .where(and(eq(programs.locationId, locationId), eq(programs.slug, progDef.slug)))
      .limit(1);
    if (existing) {
      programIdBySlug[progDef.slug] = existing.id;
    } else {
      const [inserted] = await db
        .insert(programs)
        .values({
          slug: progDef.slug,
          name: progDef.name,
          description: progDef.description,
          programType: progDef.programType,
          locationId,
          sportId,
          audienceType: progDef.audienceType,
          active: true,
        })
        .returning({ id: programs.id });
      programIdBySlug[progDef.slug] = inserted.id;
    }
  }
  console.log(`   ✓ ${PROGRAMS.length} programs upserted`);

  // 8. Seasons — ageGroupId derived from program's defaultAgeGroupKey
  // unless the season explicitly overrides via ageGroupKeyOverride.
  console.log("\n8. Seasons...");
  let seasonsCreated = 0;
  let seasonsSkipped = 0;
  for (const seasonDef of ALL_SEASONS) {
    const programId = programIdBySlug[seasonDef.programSlug];
    if (!programId) {
      console.warn(`   ⚠ skipping ${seasonDef.slug} — program ${seasonDef.programSlug} not found`);
      continue;
    }
    const [existing] = await db
      .select({ id: seasons.id })
      .from(seasons)
      .where(and(eq(seasons.programId, programId), eq(seasons.slug, seasonDef.slug)))
      .limit(1);
    if (existing) {
      seasonsSkipped += 1;
      continue;
    }
    const ageKey =
      seasonDef.ageGroupKeyOverride ?? programDefaultAgeGroupKey[seasonDef.programSlug];
    const ageGroupId = ageKey ? ageGroupIdByKey[ageKey] ?? null : null;
    await db.insert(seasons).values({
      programId,
      ageGroupId,
      slug: seasonDef.slug,
      name: seasonDef.name,
      startDate: seasonDef.startDate,
      endDate: seasonDef.endDate,
      registrationOpens: seasonDef.registrationOpens
        ? new Date(seasonDef.registrationOpens)
        : null,
      registrationCloses: seasonDef.registrationCloses
        ? new Date(seasonDef.registrationCloses)
        : null,
      earlyBirdDeadline: seasonDef.earlyBirdDeadline
        ? new Date(seasonDef.earlyBirdDeadline)
        : null,
      earlyBirdPriceCents: seasonDef.earlyBirdPriceCents ?? null,
      priceCents: seasonDef.priceCents,
      depositCents: seasonDef.depositCents ?? null,
      allowDeposit: seasonDef.allowDeposit ?? false,
      maxParticipants: seasonDef.maxParticipants ?? null,
      minParticipants: seasonDef.minParticipants ?? null,
      scheduleNotes: seasonDef.scheduleNotes ?? null,
      status: "draft",
    });
    seasonsCreated += 1;
  }
  console.log(
    `   ✓ ${seasonsCreated} seasons created, ${seasonsSkipped} already existed (idempotent)`,
  );

  console.log("\n✅ Launch catalog seed complete.");
  console.log(
    "\nAll seasons inserted with status='draft'. Flip individual seasons to 'open' " +
      "from the admin UI (/admin/seasons) when their registration window opens.",
  );
  console.log(
    "\nSummary: " +
      `${PROGRAMS.length} programs, ${ALL_SEASONS.length} seasons ` +
      `(${SUMMER_2026_SEASONS.length} summer + ${FALL_2026_SEASONS.length} fall).`,
  );
}

// ESM entry-point detection
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  seedLaunch2026()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("\n❌ Launch seed failed:", err);
      process.exit(1);
    });
}

export { seedLaunch2026 };
