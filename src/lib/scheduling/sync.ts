/**
 * Source-row → ledger synchronization.
 *
 * Each sync function reads its source row and makes the ledger agree:
 * row occupies field time → upsert its block; row gone/cancelled/
 * unattributable → remove its block. Idempotent by construction, so
 * callers fire them after ANY mutation without tracking what changed.
 *
 * Conflict behavior: upserts run the family conflict check and can throw
 * BlockConflictError. Callers decide whether that aborts the user action
 * (rental holds — yes) or surfaces as a warning (admin game scheduling —
 * caller catches and reports).
 */
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { games, teams } from "@/lib/db/schema/teams";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { dropInSessions } from "@/lib/db/schema/drop-in";
import { venueResources } from "@/lib/db/schema/scheduling";
import { alias } from "drizzle-orm/pg-core";
import { removeSourceBlock, upsertSourceBlock } from "./blocks";

/** Resolve (venueId, fieldNumber) → top-level resource id, or null. */
async function topLevelResource(
  venueId: string,
  fieldNumber: number,
): Promise<string | null> {
  const [row] = await getDb()
    .select({ id: venueResources.id })
    .from(venueResources)
    .where(
      and(
        eq(venueResources.venueId, venueId),
        eq(venueResources.fieldNumber, fieldNumber),
        isNull(venueResources.parentResourceId),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}

const GAME_DEFAULT_MINUTES = 60;

export async function syncGameBlock(gameId: string): Promise<void> {
  const db = getDb();
  const home = alias(teams, "home");
  const away = alias(teams, "away");
  const [g] = await db
    .select({
      id: games.id,
      venueId: games.venueId,
      fieldNumber: games.fieldNumber,
      scheduledAt: games.scheduledAt,
      durationMinutes: games.durationMinutes,
      status: games.status,
      homeName: home.name,
      awayName: away.name,
    })
    .from(games)
    .leftJoin(home, eq(games.homeTeamId, home.id))
    .leftJoin(away, eq(games.awayTeamId, away.id))
    .where(eq(games.id, gameId))
    .limit(1);

  if (!g || !["scheduled", "in_progress"].includes(g.status)) {
    await removeSourceBlock("game", gameId);
    return;
  }

  const fieldNum =
    g.fieldNumber && /^[0-9]+$/.test(g.fieldNumber) ? Number(g.fieldNumber) : null;
  const resourceId =
    g.venueId && fieldNum !== null
      ? await topLevelResource(g.venueId, fieldNum)
      : null;
  if (!resourceId) {
    // Unattributable (no venue/field) — not inventory-tracked.
    await removeSourceBlock("game", gameId);
    return;
  }

  const startsAt = g.scheduledAt;
  const endsAt = new Date(
    startsAt.getTime() + (g.durationMinutes ?? GAME_DEFAULT_MINUTES) * 60_000,
  );
  await upsertSourceBlock({
    sourceType: "game",
    sourceId: gameId,
    resourceId,
    startsAt,
    endsAt,
    label: `${g.homeName ?? "TBD"} vs ${g.awayName ?? "TBD"}`,
  });
}

export async function syncRentalBlock(rentalId: string): Promise<void> {
  const db = getDb();
  const [r] = await db
    .select({
      id: fieldRentals.id,
      venueId: fieldRentals.venueId,
      fieldNumber: fieldRentals.fieldNumber,
      startsAt: fieldRentals.startsAt,
      endsAt: fieldRentals.endsAt,
      status: fieldRentals.status,
      paymentExpiresAt: fieldRentals.paymentExpiresAt,
      renterName: fieldRentals.renterName,
    })
    .from(fieldRentals)
    .where(eq(fieldRentals.id, rentalId))
    .limit(1);

  if (!r || !["pending_payment", "confirmed"].includes(r.status)) {
    await removeSourceBlock("rental", rentalId);
    return;
  }

  const resourceId = await topLevelResource(r.venueId, r.fieldNumber);
  if (!resourceId) {
    await removeSourceBlock("rental", rentalId);
    return;
  }

  await upsertSourceBlock({
    sourceType: "rental",
    sourceId: rentalId,
    resourceId,
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    label: `Rental — ${r.renterName}`,
    expiresAt: r.status === "pending_payment" ? r.paymentExpiresAt : null,
  });
}

export async function syncDropInSessionBlock(sessionId: string): Promise<void> {
  const db = getDb();
  const [s] = await db
    .select({
      id: dropInSessions.id,
      bookableResourceId: dropInSessions.bookableResourceId,
      startsAt: dropInSessions.startsAt,
      endsAt: dropInSessions.endsAt,
      status: dropInSessions.status,
      label: dropInSessions.sportOrClassLabel,
      formatLabel: dropInSessions.formatLabel,
    })
    .from(dropInSessions)
    .where(eq(dropInSessions.id, sessionId))
    .limit(1);

  if (!s || s.status !== "scheduled" || !s.bookableResourceId) {
    await removeSourceBlock("drop_in", sessionId);
    return;
  }

  await upsertSourceBlock({
    sourceType: "drop_in",
    sourceId: sessionId,
    resourceId: s.bookableResourceId,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    label: [s.label, s.formatLabel].filter(Boolean).join(" · "),
  });
}
