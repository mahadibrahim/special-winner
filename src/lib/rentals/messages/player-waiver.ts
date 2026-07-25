/**
 * Renders and dispatches the per-player waiver notifications for field
 * rentals: an "invite" sent when a player is added to a rental's roster, and
 * a "reminder" sent by the unsigned-waiver reminder cron. Structure mirrors
 * request-lifecycle.ts — same brand handling, same renderEmail/sendEmail
 * wrapper — but is minor-aware: a minor's waiver is signed by a parent or
 * guardian, so the copy addresses the signer directly ("You're signing on
 * behalf of {playerName}") rather than the player themselves.
 *
 * Unlike the renter-facing rental messages (which fall back to SMS), a
 * roster player has no phone on file — only `signerEmail` — so dispatch is
 * email-only.
 */
import { eq, and, isNull, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals, fieldRentalPlayers } from "@/lib/db/schema/field-rentals";
import { selfServiceTokens } from "@/lib/db/schema/self-service-tokens";
import { venues } from "@/lib/db/schema/teams";
import { organizations } from "@/lib/db/schema/organizations";
import { renderEmail } from "@/lib/email/render";
import { PlayerWaiverEmail } from "@/lib/email/templates/player-waiver";
import { sendEmail, isEmailConfigured, fromForBrand } from "@/lib/email";
import { normalizeBrand } from "@/lib/organization/soccerone-routing";
import { formatRentalWindow } from "./format";
import { env } from "@/lib/env";
import type { BrandId } from "@/lib/branding/themes";

export interface PlayerWaiverContext {
  playerName: string;
  isMinor: boolean;
  venueName: string;
  whenLabel: string;
  signUrl: string;
  brand?: BrandId;
}

export interface PlayerWaiverDispatchResult {
  ok: boolean;
  reason?: string;
}

export async function renderPlayerWaiverInvite(
  ctx: PlayerWaiverContext,
): Promise<{ email: { subject: string; html: string; text: string } }> {
  const brand = normalizeBrand(ctx.brand);
  const subject = `Waiver needed for ${ctx.playerName} — ${ctx.venueName}`;

  const { html, text } = await renderEmail(
    PlayerWaiverEmail({
      kind: "invite",
      playerName: ctx.playerName,
      isMinor: ctx.isMinor,
      venueName: ctx.venueName,
      whenLabel: ctx.whenLabel,
      signUrl: ctx.signUrl,
      brand,
    }),
  );

  return { email: { subject, html, text } };
}

export async function renderPlayerWaiverReminder(
  ctx: PlayerWaiverContext,
): Promise<{ email: { subject: string; html: string; text: string } }> {
  const brand = normalizeBrand(ctx.brand);
  const subject = `Reminder: waiver still needed for ${ctx.playerName}`;

  const { html, text } = await renderEmail(
    PlayerWaiverEmail({
      kind: "reminder",
      playerName: ctx.playerName,
      isMinor: ctx.isMinor,
      venueName: ctx.venueName,
      whenLabel: ctx.whenLabel,
      signUrl: ctx.signUrl,
      brand,
    }),
  );

  return { email: { subject, html, text } };
}

const APP_URL = env.PUBLIC_APP_URL;

async function loadPlayerForMessage(playerId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      id: fieldRentalPlayers.id,
      playerName: fieldRentalPlayers.playerName,
      isMinor: fieldRentalPlayers.isMinor,
      signerEmail: fieldRentalPlayers.signerEmail,
      status: fieldRentalPlayers.status,
      rentalId: fieldRentals.id,
      startsAt: fieldRentals.startsAt,
      endsAt: fieldRentals.endsAt,
      brand: fieldRentals.brand,
      venueName: venues.name,
      orgTimezone: organizations.timezone,
    })
    .from(fieldRentalPlayers)
    .innerJoin(fieldRentals, eq(fieldRentals.id, fieldRentalPlayers.rentalId))
    .leftJoin(venues, eq(venues.id, fieldRentals.venueId))
    .leftJoin(organizations, eq(organizations.id, fieldRentals.organizationId))
    .where(eq(fieldRentalPlayers.id, playerId))
    .limit(1);
  return row ?? null;
}

/**
 * Most-recent unconsumed `rental_player` self-serve token for this player
 * row. `targetId` on self_service_tokens is polymorphic (resolved by
 * `kind`), so this is scoped to kind = "rental_player" as well as targetId.
 */
async function loadActiveTokenForPlayer(playerId: string): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({ token: selfServiceTokens.token })
    .from(selfServiceTokens)
    .where(
      and(
        eq(selfServiceTokens.targetId, playerId),
        eq(selfServiceTokens.kind, "rental_player"),
        isNull(selfServiceTokens.consumedAt),
      ),
    )
    .orderBy(desc(selfServiceTokens.createdAt))
    .limit(1);
  return row?.token ?? null;
}

async function dispatchPlayerWaiverMessage(
  playerId: string,
  kind: "invite" | "reminder",
): Promise<PlayerWaiverDispatchResult> {
  const row = await loadPlayerForMessage(playerId);
  if (!row) return { ok: false, reason: "player_not_found" };
  if (!row.signerEmail) return { ok: false, reason: "no_contact_info" };

  const token = await loadActiveTokenForPlayer(playerId);
  if (!token) return { ok: false, reason: "no_active_token" };

  if (!isEmailConfigured()) return { ok: false, reason: "email_not_configured" };

  const brand = normalizeBrand(row.brand);
  const whenLabel = formatRentalWindow(row.startsAt, row.endsAt, row.orgTimezone ?? null);
  const signUrl = `${APP_URL}/self-serve/${token}`;

  const ctx: PlayerWaiverContext = {
    playerName: row.playerName,
    isMinor: row.isMinor,
    venueName: row.venueName ?? "the facility",
    whenLabel,
    signUrl,
    brand,
  };

  const variants =
    kind === "invite" ? await renderPlayerWaiverInvite(ctx) : await renderPlayerWaiverReminder(ctx);

  const r = await sendEmail({
    to: row.signerEmail,
    subject: variants.email.subject,
    html: variants.email.html,
    text: variants.email.text,
    from: fromForBrand(brand),
  });

  return r.success ? { ok: true } : { ok: false, reason: "email_failed" };
}

/** Sent when a player is added to a field rental's roster. */
export const dispatchPlayerWaiverInvite = (playerId: string) =>
  dispatchPlayerWaiverMessage(playerId, "invite");

/** Sent by the unsigned-waiver reminder cron for players still pending. */
export const dispatchPlayerWaiverReminder = (playerId: string) =>
  dispatchPlayerWaiverMessage(playerId, "reminder");
