/**
 * POST /api/referee/matches/[gameId]/close-out
 *
 * Atomic referee close-out (Task 3, product-backlog build #4 follow-on).
 * Collapses the three separate finish endpoints (report / ejections /
 * check-out) into ONE transaction: score + None-gated cards/injuries/
 * ejections + opportunistic check-out. Payable ⇔ games.status = 'completed'
 * — a valid submit sets that status; no new payment enum.
 *
 * Ejections are additive + carry a suspension trail (see create-ejection.ts)
 * and are created ONLY via createEjection(tx, …) inside this transaction.
 * The `ejections` array in the request body carries ONLY newly-added
 * ejections — the client never resends already-recorded ones — so a
 * resubmit with `ejections: []` must not (and does not) touch suspensions.
 * The incident replace step below deletes `type <> 'ejection'` only, same
 * defensive guard as report.ts, so an already-recorded ejection incident is
 * never erased by a routine score-correction resubmit.
 *
 * Check-out is opportunistic: this endpoint clocks out an open check-in for
 * this user+game if one exists; if none exists, that's fine — it does not
 * error (mirrors check-out.ts's "no open check-in" case, but silently here
 * rather than 404, since close-out isn't primarily a check-out action).
 */
import type { APIRoute } from "astro";
import { and, eq, ne, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { games, gameIncidents } from "@/lib/db/schema/teams";
import { seasons, programs } from "@/lib/db/schema/programs";
import { locations } from "@/lib/db/schema/organizations";
import { timeEntries } from "@/lib/db/schema/time-tracking";
import { requireAssignedOfficial } from "@/lib/referee/require-assigned-official";
import { createEjection } from "@/lib/referee/create-ejection";
import { ejectionSchema } from "@/lib/suspensions/ejection-schema";

export const prerender = false;
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

const SIDES = new Set(["home", "away"]);
const isNonNegInt = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;

interface IncidentInput {
  side: string;
  player?: string | null;
  minute?: number | null;
  description?: string | null;
}
interface CloseOutBody {
  homeScore: number;
  awayScore: number;
  cards: Array<IncidentInput & { type: string }>;
  injuries: IncidentInput[];
  ejections: unknown[];
  noCards: boolean;
  noInjuries: boolean;
  noEjections: boolean;
  refereeNotes?: string | null;
}

function validIncident(inc: IncidentInput): boolean {
  if (!SIDES.has(inc.side)) return false;
  if (inc.minute != null && !isNonNegInt(inc.minute)) return false;
  return true;
}

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json({ error: "Unauthorized" }, 401);
  const gameId = context.params.gameId;
  if (!gameId) return json({ error: "game id required" }, 400);
  if (!(await requireAssignedOfficial(user.id, gameId))) return json({ error: "Not found" }, 404);

  let body: CloseOutBody;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // Score required
  if (!isNonNegInt(body.homeScore) || !isNonNegInt(body.awayScore))
    return json({ error: "Scores must be non-negative integers" }, 400);

  const cards = Array.isArray(body.cards) ? body.cards : [];
  const injuries = Array.isArray(body.injuries) ? body.injuries : [];
  const ejections = Array.isArray(body.ejections) ? body.ejections : [];

  // None-gates: each section must be answered (has entries XOR acknowledged None)
  const section = (arr: unknown[], none: boolean) => arr.length > 0 !== (none === true); // true when EXACTLY one holds
  if (!section(cards, body.noCards)) return json({ error: "Answer the cards section (log cards or mark None)" }, 400);
  if (!section(injuries, body.noInjuries))
    return json({ error: "Answer the injuries section (log injuries or mark None)" }, 400);
  if (!section(ejections, body.noEjections))
    return json({ error: "Answer the ejections section (log ejections or mark None)" }, 400);

  // Card/injury shape
  for (const c of cards)
    if ((c.type !== "yellow_card" && c.type !== "red_card") || !validIncident(c))
      return json({ error: "Invalid card" }, 400);
  for (const inj of injuries) if (!validIncident(inj)) return json({ error: "Invalid injury" }, 400);

  // Ejection shape (reuse the shared schema) + resolve org/team
  const parsedEjections = ejections.map((e) => ejectionSchema.safeParse(e));
  const badEjection = parsedEjections.find((p) => !p.success);
  if (badEjection && !badEjection.success)
    return json({ error: "Invalid ejection payload", issues: badEjection.error.issues }, 400);

  const db = getDb();
  const [gameRow] = await db
    .select({
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      organizationId: locations.organizationId,
    })
    .from(games)
    .innerJoin(seasons, eq(games.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(eq(games.id, gameId))
    .limit(1);
  if (!gameRow) return json({ error: "Not found" }, 404);

  // A suspension needs a real team
  for (const p of parsedEjections) {
    if (!p.success) continue;
    const teamId = p.data.side === "home" ? gameRow.homeTeamId : gameRow.awayTeamId;
    if (p.data.carriesSuspension && !teamId) return json({ error: "Cannot record a suspension for a TBD team" }, 400);
  }

  await db.transaction(async (tx) => {
    // 1. Score + status + notes
    await tx
      .update(games)
      .set({
        homeScore: body.homeScore,
        awayScore: body.awayScore,
        status: "completed",
        refereeNotes: body.refereeNotes ?? null,
        updatedAt: new Date(),
      })
      .where(eq(games.id, gameId));

    // 2. Replace non-ejection incidents (cards + injuries). Ejections untouched.
    await tx.delete(gameIncidents).where(and(eq(gameIncidents.gameId, gameId), ne(gameIncidents.type, "ejection")));
    const rows = [
      ...cards.map((c) => ({
        gameId,
        reportedByUserId: user.id,
        type: c.type as "yellow_card" | "red_card",
        side: c.side as "home" | "away",
        player: c.player ?? null,
        minute: c.minute ?? null,
        description: c.description ?? null,
      })),
      ...injuries.map((i) => ({
        gameId,
        reportedByUserId: user.id,
        type: "injury" as const,
        side: i.side as "home" | "away",
        player: i.player ?? null,
        minute: i.minute ?? null,
        description: i.description ?? null,
      })),
    ];
    if (rows.length > 0) await tx.insert(gameIncidents).values(rows);

    // 3. Create NEW ejections only (client sends only newly-added ones).
    for (const p of parsedEjections) {
      if (!p.success) continue;
      const teamId = p.data.side === "home" ? gameRow.homeTeamId : gameRow.awayTeamId;
      await createEjection(tx, {
        gameId,
        reportedByUserId: user.id,
        organizationId: gameRow.organizationId,
        teamId,
        input: p.data,
      });
    }

    // 4. Opportunistic check-out — close an open check-in if one exists.
    await tx
      .update(timeEntries)
      .set({ clockOutAt: new Date(), updatedAt: new Date() })
      .where(and(eq(timeEntries.gameId, gameId), eq(timeEntries.userId, user.id), isNull(timeEntries.clockOutAt)));
  });

  return json({ ok: true }, 200);
};
