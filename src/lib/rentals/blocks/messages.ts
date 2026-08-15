/**
 * Renter-facing notifications for a recurring rental block.
 *
 * Mirrors `@/lib/rentals/messages/dispatch` — blocks carry their own contact
 * fields and may belong to a guest with no account, so we send straight to
 * `renter_email` / `renter_phone`: email-preferred, SMS fallback (so a renter
 * who gave both isn't double-notified). `sendEmail` / `sendSms` own the
 * MESSAGING_LIVE guard, so nothing here needs to check it and nothing may
 * bypass it.
 *
 * Brand comes from the BLOCK's own `brand` column, which the Storefront select
 * set at build time — never from `locals.brandId`, because an admin builds a
 * SoccerOne block from the Aspire admin host.
 */
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { fieldRentalBlocks } from "@/lib/db/schema/field-rental-blocks";
import { locations, organizations } from "@/lib/db/schema/organizations";
import { venues } from "@/lib/db/schema/teams";
import { sendEmail, isEmailConfigured, fromForBrand } from "@/lib/email";
import { sendSms, normalizeUsPhone } from "@/lib/sms/send";
import { renderEmail } from "@/lib/email/render";
import { RentalBlockQuoteEmail } from "@/lib/email/templates/rental-block-quote";
import { RentalBlockConfirmationEmail } from "@/lib/email/templates/rental-block-confirmation";
import { normalizeBrand, originForBrand } from "@/lib/organization/soccerone-routing";
import { getAdminNotifyEmail } from "@/lib/organization/notify";
import { escapeHtml } from "@/lib/dropin/messages/types";
import { env } from "@/lib/env";
import { mintBlockToken } from "./tokens";

const APP_URL = env.PUBLIC_APP_URL;
const DEFAULT_TZ = "America/New_York";

export interface BlockDispatchResult {
  ok: boolean;
  channel?: "email" | "sms";
  reason?: string;
  error?: string;
}

/**
 * Whole dollars, per the block money invariant: `$2,808`, never `$2,808.00`.
 * Cents exist only because Stripe and the schema store minor units.
 */
export function blockDollars(cents: number): string {
  return `$${Math.round(cents / 100).toLocaleString("en-US")}`;
}

/**
 * One line per session: `Tue Jan 6 · 8:00–9:00 PM · Orange`.
 *
 * Pure and timezone-anchored: a block that crosses the November fallback must
 * print `8:00 PM` on both sides of it, which only holds if every instant is
 * formatted in the org zone rather than offset arithmetic.
 */
export function formatBlockScheduleLines(
  sessions: Array<{ startsAt: Date; endsAt: Date; venueName: string }>,
  tz: string,
): string[] {
  const timeZone = tz || DEFAULT_TZ;
  const dateFmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const timeFmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  });

  return sessions.map((s) => {
    // "Tue, Jan 6" → "Tue Jan 6": the comma reads as a list separator once
    // the line already uses · between its three parts.
    const dateLabel = dateFmt.format(s.startsAt).replace(",", "");
    const startRaw = timeFmt.format(s.startsAt);
    const endRaw = timeFmt.format(s.endsAt);
    // Drop the redundant meridiem from the start when both share one, so an
    // evening slot reads "8:00–9:00 PM" rather than "8:00 PM–9:00 PM".
    const startLabel =
      startRaw.slice(-2) === endRaw.slice(-2) ? startRaw.slice(0, -3) : startRaw;
    return `${dateLabel} · ${startLabel}–${endRaw} · ${s.venueName}`;
  });
}

interface BlockMessageRow {
  block: typeof fieldRentalBlocks.$inferSelect;
  timeZone: string;
  locationName: string | null;
  sessions: Array<{ startsAt: Date; endsAt: Date; venueName: string }>;
}

async function loadBlockForMessage(blockId: string): Promise<BlockMessageRow | null> {
  const db = getDb();
  const [row] = await db
    .select({
      block: fieldRentalBlocks,
      orgTimezone: organizations.timezone,
      locationName: locations.name,
      locationTimezone: locations.timezone,
    })
    .from(fieldRentalBlocks)
    .leftJoin(organizations, eq(organizations.id, fieldRentalBlocks.organizationId))
    .leftJoin(locations, eq(locations.id, fieldRentalBlocks.locationId))
    .where(eq(fieldRentalBlocks.id, blockId))
    .limit(1);
  if (!row) return null;

  const sessions = await db
    .select({
      startsAt: fieldRentals.startsAt,
      endsAt: fieldRentals.endsAt,
      venueName: venues.name,
      status: fieldRentals.status,
    })
    .from(fieldRentals)
    .innerJoin(venues, eq(venues.id, fieldRentals.venueId))
    .where(eq(fieldRentals.blockId, blockId))
    .orderBy(asc(fieldRentals.startsAt));

  return {
    block: row.block,
    timeZone: row.locationTimezone ?? row.orgTimezone ?? DEFAULT_TZ,
    locationName: row.locationName ?? null,
    sessions: sessions
      .filter((s) => s.status !== "cancelled")
      .map((s) => ({ startsAt: s.startsAt, endsAt: s.endsAt, venueName: s.venueName })),
  };
}

/** The renter's one link — brand-canonical origin so a SoccerOne renter stays on gosoccerone. */
async function blockUrl(block: typeof fieldRentalBlocks.$inferSelect): Promise<string> {
  const token = await mintBlockToken(block);
  const origin = originForBrand(block.brand) ?? APP_URL;
  return `${origin}/rentals/blocks/${token}`;
}

/** Shared email-preferred / SMS-fallback send, matching the rental dispatcher. */
async function deliver(
  row: BlockMessageRow,
  variants: { subject: string; html: string; text: string; sms: string },
): Promise<BlockDispatchResult> {
  const { block } = row;
  const hasEmail = Boolean(block.renterEmail);
  const hasPhone = Boolean(block.renterPhone);
  if (!hasEmail && !hasPhone) return { ok: false, reason: "no_contact_info" };

  const brand = normalizeBrand(block.brand);
  let lastReason: string | undefined;
  let lastError: string | undefined;

  if (hasEmail) {
    if (!isEmailConfigured()) {
      lastReason = "email_not_configured";
    } else {
      const r = await sendEmail({
        to: block.renterEmail!,
        subject: variants.subject,
        html: variants.html,
        text: variants.text,
        from: fromForBrand(brand),
      });
      if (r.success) return { ok: true, channel: "email" };
      lastReason = "email_failed";
      lastError = r.error;
    }
  }

  if (hasPhone) {
    const normalized = normalizeUsPhone(block.renterPhone!);
    if (!normalized) {
      lastReason = "invalid_phone";
    } else {
      const r = await sendSms({
        to: normalized,
        body: variants.sms,
        organizationId: block.organizationId,
      });
      if (r.ok) return { ok: true, channel: "sms" };
      lastReason = r.reason;
      lastError = r.error;
    }
  }

  return { ok: false, reason: lastReason ?? "no_channel_available", error: lastError };
}

function dayLabel(d: Date | null, tz: string): string | null {
  if (!d) return null;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    month: "short",
    day: "numeric",
  }).format(d);
}

/**
 * The ask: deposit (holds the dates) or balance (dates already held). Used by
 * the admin "send deposit link" / "send balance link" actions and by the
 * balance reminder sweep.
 */
export async function dispatchBlockQuote(
  blockId: string,
  kind: "deposit" | "balance",
): Promise<BlockDispatchResult> {
  const row = await loadBlockForMessage(blockId);
  if (!row) return { ok: false, reason: "block_not_found" };

  const { block, timeZone } = row;
  const brand = normalizeBrand(block.brand);
  const brandLabel = brand === "soccerone" ? "SoccerOne" : "Aspire";
  const amountCents = kind === "deposit" ? block.depositDueCents : block.balanceDueCents;
  const amountLabel = blockDollars(amountCents);
  const dueDay = dayLabel(
    kind === "deposit" ? block.depositExpiresAt : block.balanceDueAt,
    timeZone,
  );
  const dueLabel = dueDay
    ? kind === "deposit"
      ? `Hold expires ${dueDay}`
      : `Due ${dueDay}`
    : null;
  const payUrl = await blockUrl(block);
  const scheduleLines = formatBlockScheduleLines(row.sessions, timeZone);

  const subject =
    kind === "deposit"
      ? `${amountLabel} deposit holds your dates — ${block.label}`
      : `${amountLabel} balance due — ${block.label}`;

  const { html, text } = await renderEmail(
    RentalBlockQuoteEmail({
      recipientName: block.renterName,
      blockLabel: block.label,
      kind,
      amountLabel,
      totalLabel: blockDollars(block.totalCents),
      dueLabel,
      scheduleLines,
      payUrl,
      brand,
    }),
  );

  const sms =
    kind === "deposit"
      ? `[${brandLabel}] ${amountLabel} deposit holds all ${scheduleLines.length} of your dates for ${block.label}. Pay here: ${payUrl}`
      : `[${brandLabel}] Balance of ${amountLabel} for ${block.label}${dueDay ? ` is due ${dueDay}` : ""}. Pay here: ${payUrl}`;

  return deliver(row, { subject, html, text, sms });
}

/** Sent when the deposit lands and every session flips to confirmed. */
export async function dispatchBlockConfirmation(
  blockId: string,
): Promise<BlockDispatchResult> {
  const row = await loadBlockForMessage(blockId);
  if (!row) return { ok: false, reason: "block_not_found" };

  const { block, timeZone } = row;
  const brand = normalizeBrand(block.brand);
  const brandLabel = brand === "soccerone" ? "SoccerOne" : "Aspire";
  const manageUrl = await blockUrl(block);
  const scheduleLines = formatBlockScheduleLines(row.sessions, timeZone);
  const balanceDay = dayLabel(block.balanceDueAt, timeZone);
  const balanceLabel =
    block.balancePaidAt || block.balanceDueCents === 0
      ? null
      : `${blockDollars(block.balanceDueCents)}${balanceDay ? ` due ${balanceDay}` : ""}`;

  const { html, text } = await renderEmail(
    RentalBlockConfirmationEmail({
      recipientName: block.renterName,
      blockLabel: block.label,
      scheduleLines,
      depositPaidLabel: blockDollars(block.depositDueCents),
      balanceLabel,
      manageUrl,
      brand,
    }),
  );

  const sms = `[${brandLabel}] Confirmed: all ${scheduleLines.length} sessions for ${block.label} are yours.${
    balanceLabel ? ` Balance ${balanceLabel}.` : ""
  } Schedule: ${manageUrl}`;

  return deliver(row, {
    subject: `Confirmed — ${block.label}`,
    html,
    text,
    sms,
  });
}

/**
 * A block lost its slots between the payment link going out and the money
 * landing. The deposit is refunded by the webhook; this tells the two people
 * who need to know. Plain HTML rather than a template: it is an apology and a
 * phone-call prompt, not a transaction record.
 */
export async function dispatchBlockRaceLost(
  blockId: string,
  refunded: boolean,
): Promise<BlockDispatchResult> {
  const row = await loadBlockForMessage(blockId);
  if (!row) return { ok: false, reason: "block_not_found" };
  const { block } = row;
  const brand = normalizeBrand(block.brand);

  const refundLine = refunded
    ? "Your payment has been refunded in full and should be back on your card within a few business days."
    : "We're processing your refund now and will confirm as soon as it clears.";

  // Admin first: a lost race needs a human to call the renter back.
  const adminTo = await getAdminNotifyEmail(block.organizationId);
  if (adminTo && isEmailConfigured()) {
    const reviewUrl = `${APP_URL}/admin/rentals/blocks/${block.id}`;
    await sendEmail({
      to: adminTo,
      subject: `Rental block lost its slots after payment — ${block.label}`,
      html: `<p>${escapeHtml(block.label)} (${escapeHtml(block.renterName)}) was paid for, but one or more sessions had been taken by the time the payment landed. The block is cancelled and the deposit was ${refunded ? "refunded" : "NOT refunded — refund by hand"}.</p><p><a href="${reviewUrl}">Open the block</a></p>`,
      text: `${block.label} (${block.renterName}) lost its slots after payment. Block cancelled; deposit ${refunded ? "refunded" : "NOT refunded — refund by hand"}. ${reviewUrl}`,
      from: fromForBrand(brand),
    });
  }

  const html = `<p>Hi ${escapeHtml(block.renterName)},</p><p>We're sorry — one or more of the dates in <strong>${escapeHtml(block.label)}</strong> was booked by someone else in the moments before your payment reached us, so we couldn't confirm the block.</p><p>${refundLine}</p><p>We'll call you to find dates that work. You can also reach us any time.</p>`;
  const text = `Hi ${block.renterName}, one or more dates in ${block.label} was booked by someone else just before your payment landed, so we couldn't confirm the block. ${refundLine} We'll call you to find replacement dates.`;
  const sms = `We're sorry — the dates for ${block.label} were taken just before your payment landed, so the block wasn't confirmed. ${refundLine}`;

  return deliver(row, {
    subject: `We couldn't confirm ${block.label}`,
    html,
    text,
    sms,
  });
}
