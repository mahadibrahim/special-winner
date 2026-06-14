// STATUS: APPLIED TO PROD 2026-06-13 — created 88 draft seasons + 6 programs +
// Futsal sport + Adult Over 40 age group under the Aspire org. This file is the
// canonical, reproducible definition of the 2026-27 season calendar (the rows
// are draft, hidden until flipped to forming/open in /admin/seasons). It is
// idempotent (select-by-slug), so re-running is safe and only adds anything new.
//
// Standalone 2026-27 catalog seed — Aspire org, leagues only (adult soccer,
// futsal, youth) across 4 sessions, all status=draft. Idempotent
// (select-by-slug). Self-contained (only `postgres`) so it runs under native
// Node TS (tsx is broken on Node 25). DRY-RUN by default; pass --commit to write.
//
//   railway run bash -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" node scripts/seed-2026-27-catalog.ts'            # dry-run
//   railway run bash -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" node scripts/seed-2026-27-catalog.ts --commit'   # write
//
// Out of scope (no pricing/spec yet): classes (membership-based), Drop League
// (spec not located), break-week camps (camp pricing undecided).
import postgres from "postgres";

const COMMIT = process.argv.includes("--commit");
const ORG_SLUG = "aspire-sports";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("No DATABASE_URL. Run via: railway run bash -c 'DATABASE_URL=\"$DATABASE_PUBLIC_URL\" node scripts/seed-2026-27-catalog.ts [--commit]'");
  process.exit(1);
}
const sql = postgres(url, { max: 1 });

// noon UTC keeps the calendar day correct in America/New_York
const ts = (d: string) => new Date(`${d}T12:00:00Z`);
const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

// ---- Pricing (cents) ----
const P = {
  adultTeam: 105_000, adultTeamEB: 100_000, adultIndiv: 12_000, adultDeposit: 20_000,
  futsalTeam: 75_000, futsalIndiv: 12_000, futsalDeposit: 15_000,
  youthPlayer: 12_000,
};

// ---- Sessions (school-calendar-verified) ----
const SESSIONS = [
  { key: "fall-2026",     label: "Fall 2026",        start: "2026-09-14", end: "2026-11-08", regOpen: "2026-07-13", eb: "2026-08-03", regClose: "2026-09-03" },
  { key: "winter-1-2627", label: "Winter 1 2026-27", start: "2026-11-09", end: "2027-01-17", regOpen: "2026-09-14", eb: "2026-09-28", regClose: "2026-10-29" },
  { key: "winter-2-2027", label: "Winter 2 2027",    start: "2027-01-18", end: "2027-03-20", regOpen: "2026-11-16", eb: "2026-12-07", regClose: "2027-01-07" },
  { key: "spring-2027",   label: "Spring 2027",      start: "2027-04-05", end: "2027-05-30", regOpen: "2027-02-08", eb: "2027-02-22", regClose: "2027-03-25" },
];

// ---- Programs (reuse existing by (location, slug); create if absent) ----
type ProgSpec = { key: string; loc: string; sport: string; name: string; slug: string; type: string; audience: string };
const PROGRAMS: ProgSpec[] = [
  { key: "dt-coed",        loc: "downtown",    sport: "soccer", name: "Adult Co-Ed 7v7 League", slug: "adult-coed-7v7",            type: "league", audience: "adults" },
  { key: "dt-mens",        loc: "downtown",    sport: "soccer", name: "Adult Men's 7v7 League", slug: "adult-mens-7v7",            type: "league", audience: "adults" },
  { key: "wo-coed",        loc: "worthington", sport: "soccer", name: "Adult Co-Ed 7v7 League", slug: "adult-coed-7v7",            type: "league", audience: "adults" },
  { key: "wo-mens",        loc: "worthington", sport: "soccer", name: "Adult Men's 7v7 League", slug: "adult-mens-7v7",            type: "league", audience: "adults" },
  { key: "wo-womens",      loc: "worthington", sport: "soccer", name: "Women's 7v7 League",     slug: "womens-7v7",                type: "league", audience: "adults" },
  { key: "wo-youth",       loc: "worthington", sport: "soccer", name: "Worthington Youth Soccer", slug: "worthington-youth-soccer", type: "league", audience: "parents" },
  { key: "wo-futsal",      loc: "worthington", sport: "futsal", name: "Adult Futsal League",    slug: "adult-futsal",              type: "league", audience: "adults" },
  { key: "wo-youth-futsal",loc: "worthington", sport: "futsal", name: "Youth Futsal",           slug: "youth-futsal",              type: "league", audience: "parents" },
];

// ---- Divisions (each → one season per session) ----
type Kind = "adult" | "futsal" | "youth";
type DivSpec = { prog: string; label: string; age: string; kind: Kind };
const DIVISIONS: DivSpec[] = [
  // Downtown (1 field): Coed D/C/B + Men's Open/A
  { prog: "dt-coed", label: "Co-Ed D",     age: "Adult Co-Ed",  kind: "adult" },
  { prog: "dt-coed", label: "Co-Ed C",     age: "Adult Co-Ed",  kind: "adult" },
  { prog: "dt-coed", label: "Co-Ed B",     age: "Adult Co-Ed",  kind: "adult" },
  { prog: "dt-mens", label: "Open / A",    age: "Adult Open",   kind: "adult" },
  // Worthington adult 7v7 (2 fields)
  { prog: "wo-coed", label: "Co-Ed B",     age: "Adult Co-Ed",  kind: "adult" },
  { prog: "wo-coed", label: "Co-Ed C",     age: "Adult Co-Ed",  kind: "adult" },
  { prog: "wo-coed", label: "Co-Ed D",     age: "Adult Co-Ed",  kind: "adult" },
  { prog: "wo-coed", label: "Co-Ed 30+",   age: "Adult Over 30",kind: "adult" },
  { prog: "wo-coed", label: "Co-Ed 40+",   age: "Adult Over 40",kind: "adult" },
  { prog: "wo-mens", label: "Men's C",     age: "Adult Open",   kind: "adult" },
  { prog: "wo-mens", label: "Men's D",     age: "Adult Open",   kind: "adult" },
  { prog: "wo-mens", label: "Men's 30+",   age: "Adult Over 30",kind: "adult" },
  { prog: "wo-womens", label: "Women's Open", age: "Adult Open",kind: "adult" },
  // Worthington futsal (5v5)
  { prog: "wo-futsal", label: "Co-Ed Rec", age: "Adult Co-Ed",  kind: "futsal" },
  { prog: "wo-futsal", label: "Men's B",   age: "Adult Open",   kind: "futsal" },
  { prog: "wo-futsal", label: "Co-Ed Comp",age: "Adult Co-Ed",  kind: "futsal" },
  { prog: "wo-futsal", label: "Men's A",   age: "Adult Open",   kind: "futsal" },
  // Worthington youth leagues (Sat) — one game/week, no practices
  { prog: "wo-youth", label: "U6",  age: "U6",  kind: "youth" },
  { prog: "wo-youth", label: "U8",  age: "U8",  kind: "youth" },
  { prog: "wo-youth", label: "U10", age: "U10", kind: "youth" },
  { prog: "wo-youth", label: "U12", age: "U12", kind: "youth" },
  { prog: "wo-youth-futsal", label: "U7-U8", age: "U8", kind: "youth" },
];

async function getOrCreate(table: string, whereSql: postgres.PendingQuery<any>, createCols: Record<string, unknown>, descr: string): Promise<string> {
  const existing = await whereSql;
  if (existing.length) return existing[0].id;
  if (!COMMIT) { console.log(`  [dry-run] would CREATE ${table}: ${descr}`); return `(new-${table}-${slugify(descr)})`; }
  const cols = Object.keys(createCols);
  const vals = Object.values(createCols);
  const [row] = await sql`insert into ${sql(table)} ${sql(createCols as any, ...cols)} returning id`;
  void vals;
  console.log(`  ✓ created ${table}: ${descr} → ${row.id}`);
  return row.id;
}

async function main() {
  console.log(COMMIT ? "=== SEED (COMMIT — writing) ===" : "=== SEED (DRY-RUN — no writes) ===\n");

  // Org
  const [org] = await sql`select id from organizations where slug=${ORG_SLUG} and organization_type='headquarters' limit 1`;
  if (!org) throw new Error(`Aspire org (slug=${ORG_SLUG}, headquarters) not found`);
  const orgId = org.id;

  // Locations
  const locs = await sql`select id, slug from locations where organization_id=${orgId}`;
  const locId: Record<string, string> = {};
  for (const l of locs) locId[l.slug] = l.id;
  for (const need of ["downtown", "worthington"]) if (!locId[need]) throw new Error(`location '${need}' not found`);

  // Sports — soccer exists; create futsal if absent
  const sports = await sql`select id, slug from sports where organization_id=${orgId}`;
  const sportId: Record<string, string> = {};
  for (const s of sports) sportId[s.slug] = s.id;
  if (!sportId["futsal"]) {
    sportId["futsal"] = await getOrCreate("sports",
      sql`select id from sports where organization_id=${orgId} and slug='futsal' limit 1`,
      { organization_id: orgId, name: "Futsal", slug: "futsal" }, "Futsal sport");
  }

  // Age groups — create Adult Over 40 if absent
  const ages = await sql`select id, name from age_groups where organization_id=${orgId}`;
  const ageId: Record<string, string> = {};
  for (const a of ages) ageId[a.name] = a.id;
  if (!ageId["Adult Over 40"]) {
    ageId["Adult Over 40"] = await getOrCreate("age_groups",
      sql`select id from age_groups where organization_id=${orgId} and name='Adult Over 40' limit 1`,
      { organization_id: orgId, name: "Adult Over 40", min_age: 40, max_age: 99 }, "Adult Over 40 age group");
  }
  for (const d of DIVISIONS) if (!ageId[d.age] && !COMMIT && !ageId[d.age]) { /* resolved below in commit */ }

  // Programs — reuse by (location, slug) or create
  const progId: Record<string, string> = {};
  for (const p of PROGRAMS) {
    const lid = locId[p.loc];
    const sid = sportId[p.sport];
    if (!sid) throw new Error(`sport '${p.sport}' unresolved for program ${p.key}`);
    progId[p.key] = await getOrCreate("programs",
      sql`select id from programs where location_id=${lid} and slug=${p.slug} limit 1`,
      { location_id: lid, sport_id: sid, name: p.name, slug: p.slug, program_type: p.type, audience_type: p.audience, active: true },
      `${p.name} @ ${p.loc} [${p.sport}]`);
  }

  // Seasons — division × session, status=draft, idempotent by (program, slug)
  let created = 0, skipped = 0, planned = 0;
  const byProgram: Record<string, number> = {};
  for (const d of DIVISIONS) {
    const pid = progId[d.prog];
    const agId = ageId[d.age];
    if (agId === undefined && COMMIT) throw new Error(`age group '${d.age}' unresolved`);
    for (const s of SESSIONS) {
      planned++;
      const name = `${s.label} — ${d.label}`;
      const slug = `${s.key}-${slugify(d.label)}`;
      const team = d.kind === "adult" ? P.adultTeam : d.kind === "futsal" ? P.futsalTeam : null;
      const teamEB = d.kind === "adult" ? P.adultTeamEB : null;
      const indiv = d.kind === "youth" ? P.youthPlayer : d.kind === "futsal" ? P.futsalIndiv : P.adultIndiv;
      const deposit = d.kind === "adult" ? P.adultDeposit : d.kind === "futsal" ? P.futsalDeposit : null;
      const modes = d.kind === "youth" ? ["individual"] : ["team", "individual"];
      const pricingMode = d.kind === "youth" ? "per_individual" : "per_team";

      byProgram[d.prog] = (byProgram[d.prog] ?? 0) + 1;

      if (typeof pid === "string" && pid.startsWith("(new-")) {
        // program would be created in commit; in dry-run just report the season
        console.log(`  [dry-run] would CREATE season: ${name}  (${d.prog}, ${slug}, team=${team ? "$" + team / 100 : "—"}, indiv=$${indiv / 100})`);
        continue;
      }

      const existing = await sql`select id from seasons where program_id=${pid} and slug=${slug} limit 1`;
      if (existing.length) { skipped++; if (!COMMIT) console.log(`  [dry-run] SKIP (exists): ${name}`); continue; }

      if (!COMMIT) {
        console.log(`  [dry-run] would CREATE season: ${name}  (${slug}, age=${d.age}, team=${team ? "$" + team / 100 : "—"}, indiv=$${indiv / 100}, deposit=${deposit ? "$" + deposit / 100 : "—"})`);
        continue;
      }

      await sql`
        insert into seasons (program_id, age_group_id, name, slug, start_date, end_date,
          registration_opens, registration_closes, early_bird_deadline,
          price_cents, team_price_cents, early_bird_price_cents, deposit_cents, allow_deposit,
          signup_modes, pricing_mode, status)
        values (${pid}, ${agId}, ${name}, ${slug}, ${s.start}, ${s.end},
          ${ts(s.regOpen)}, ${ts(s.regClose)}, ${ts(s.eb)},
          ${indiv}, ${team}, ${teamEB}, ${deposit}, ${deposit !== null},
          ${sql.array(modes)}, ${pricingMode}, 'draft')`;
      created++;
    }
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Sessions: ${SESSIONS.length}  Divisions: ${DIVISIONS.length}  Planned seasons: ${planned}`);
  console.log(`Per program:`, byProgram);
  if (COMMIT) console.log(`Created: ${created}  Skipped (already existed): ${skipped}`);
  else console.log(`(dry-run — nothing written. Re-run with --commit to write.)`);

  await sql.end();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
