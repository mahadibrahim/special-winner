/**
 * Drop-in notification dispatcher.
 *
 * Customer-facing transactional messages — sent to whichever channel
 * the user has primary-configured (with fallback to secondary, then
 * any reachable channel). Unlike the activity-tracking dispatcher
 * (workers, all channels) we send on **one** channel only — this is
 * customer comms, not staff escalation.
 *
 * Channel resolution mirrors `src/lib/messaging/gateway.ts` but
 * stays inline so we don't drag the conversation-logging side-effects
 * of the gateway into transactional notifications. (Conversation rows
 * are reserved for two-way customer conversations.)
 *
 * SMS goes through `sendSms` with normal opt-in checks (drop-in
 * customers are consumers, not employed workers — opt-in applies).
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema/users";
import {
  dropInBookings,
  dropInSessions,
} from "@/lib/db/schema/drop-in";
import { venues } from "@/lib/db/schema/teams";
import { organizations } from "@/lib/db/schema/organizations";
import { sendEmail, isEmailConfigured, fromForBrand } from "@/lib/email";
import { sendSms, normalizeUsPhone } from "@/lib/sms/send";
import { sendTelegramRaw } from "@/lib/telegram/send";
import { normalizeBrand, originForBrand } from "@/lib/organization/soccerone-routing";
import type { BrandId } from "@/lib/branding/themes";
import { renderBookingConfirmation } from "./booking-confirmation";
import { renderWaitlistPromoted } from "./waitlist-promoted";
import { renderBookingCancelledByAdmin } from "./booking-cancelled-by-admin";
import type {
  BookingConfirmationContext,
  BookingCancelledByAdminContext,
  DropInBaseContext,
  DropInMessageRecipient,
  MessageVariants,
  WaitlistPromotedContext,
} from "./types";

export type DropInChannel = "email" | "sms" | "telegram";

export interface DropInDispatchResult {
  ok: boolean;
  channel?: DropInChannel;
  reason?: string;
  error?: string;
}

interface UserChannelInfo {
  id: string;
  email: string | null;
  firstName: string | null;
  phone: string | null;
  phoneVerified: boolean;
  telegramChatId: string | null;
  primaryChannel: string | null;
  fallbackChannel: string | null;
}

async function loadUser(userId: string): Promise<UserChannelInfo | null> {
  const db = getDb();
  const [u] = await db
    .select({
      id: users.id,
      email: users.email,
      firstName: users.firstName,
      phone: users.phone,
      phoneVerified: users.phoneVerified,
      telegramChatId: users.telegramChatId,
      primaryChannel: users.messagingPrimaryChannel,
      fallbackChannel: users.messagingFallbackChannel,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return u ?? null;
}

interface SessionContextRow {
  sessionId: string;
  organizationId: string;
  sportOrClassLabel: string;
  formatLabel: string | null;
  startsAt: Date;
  endsAt: Date;
  kind: "pickup" | "class";
  venueId: string;
  venueName: string;
  venueTimezone: string | null;
}

async function loadSessionContext(
  sessionId: string,
): Promise<SessionContextRow | null> {
  const db = getDb();
  const [row] = await db
    .select({
      sessionId: dropInSessions.id,
      organizationId: dropInSessions.organizationId,
      sportOrClassLabel: dropInSessions.sportOrClassLabel,
      formatLabel: dropInSessions.formatLabel,
      startsAt: dropInSessions.startsAt,
      endsAt: dropInSessions.endsAt,
      kind: dropInSessions.kind,
      venueId: dropInSessions.venueId,
      venueName: venues.name,
      // Venues don't carry their own timezone; we use the parent org's
      // timezone for display formatting (drop-in is single-org per venue).
      orgTimezone: organizations.timezone,
    })
    .from(dropInSessions)
    .leftJoin(venues, eq(venues.id, dropInSessions.venueId))
    .leftJoin(organizations, eq(organizations.id, dropInSessions.organizationId))
    .where(eq(dropInSessions.id, sessionId))
    .limit(1);
  if (!row) return null;
  return {
    sessionId: row.sessionId,
    organizationId: row.organizationId,
    sportOrClassLabel: row.sportOrClassLabel,
    formatLabel: row.formatLabel,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    kind: row.kind as "pickup" | "class",
    venueId: row.venueId,
    venueName: row.venueName ?? "venue",
    venueTimezone: row.orgTimezone ?? null,
  };
}

interface BookingContextRow {
  id: string;
  sessionId: string;
  userId: string;
  amountPaidCents: number;
  paymentMethod: string;
  teamAssignment: string | null;
  source: "online_booking" | "walk_up";
  brand: BrandId;
}

async function loadBooking(bookingId: string): Promise<BookingContextRow | null> {
  const db = getDb();
  const [row] = await db
    .select({
      id: dropInBookings.id,
      sessionId: dropInBookings.sessionId,
      userId: dropInBookings.userId,
      amountPaidCents: dropInBookings.amountPaidCents,
      paymentMethod: dropInBookings.paymentMethod,
      teamAssignment: dropInBookings.teamAssignment,
      source: dropInBookings.source,
      brand: dropInBookings.brand,
    })
    .from(dropInBookings)
    .where(eq(dropInBookings.id, bookingId))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    sessionId: row.sessionId,
    userId: row.userId,
    amountPaidCents: row.amountPaidCents,
    paymentMethod: row.paymentMethod,
    teamAssignment: row.teamAssignment,
    source: row.source as "online_booking" | "walk_up",
    brand: (row.brand as BrandId) ?? "aspire",
  };
}

function resolveChannelOrder(u: UserChannelInfo): DropInChannel[] {
  const hasEmail = Boolean(u.email);
  const hasSms = Boolean(u.phone && u.phoneVerified);
  const hasTelegram = Boolean(u.telegramChatId);

  const canSend = (c: DropInChannel) =>
    (c === "email" && hasEmail) ||
    (c === "sms" && hasSms) ||
    (c === "telegram" && hasTelegram);

  const order: DropInChannel[] = [];
  const primary = (u.primaryChannel as DropInChannel | null) ??
    (hasEmail ? "email" : hasSms ? "sms" : hasTelegram ? "telegram" : null);
  if (primary && canSend(primary) && !order.includes(primary)) order.push(primary);

  const fallback = u.fallbackChannel as DropInChannel | null;
  if (fallback && canSend(fallback) && !order.includes(fallback)) order.push(fallback);

  for (const c of ["email", "sms", "telegram"] as DropInChannel[]) {
    if (canSend(c) && !order.includes(c)) order.push(c);
  }
  return order;
}

async function deliverOnce(
  channel: DropInChannel,
  variants: MessageVariants,
  user: UserChannelInfo,
  organizationId: string,
  brand?: BrandId,
): Promise<{ ok: boolean; reason?: string; error?: string }> {
  if (channel === "email") {
    if (!isEmailConfigured()) return { ok: false, reason: "email_not_configured" };
    if (!user.email) return { ok: false, reason: "no_email" };
    const r = await sendEmail({
      to: user.email,
      subject: variants.email.subject,
      html: variants.email.html,
      text: variants.email.text,
      from: fromForBrand(brand),
    });
    return r.success ? { ok: true } : { ok: false, reason: "email_failed", error: r.error };
  }
  if (channel === "sms") {
    if (!user.phone) return { ok: false, reason: "no_phone" };
    const normalized = normalizeUsPhone(user.phone);
    if (!normalized) return { ok: false, reason: "invalid_phone" };
    const r = await sendSms({
      to: normalized,
      body: variants.sms.body,
      organizationId,
    });
    return r.ok
      ? { ok: true }
      : { ok: false, reason: r.reason, error: r.error };
  }
  if (channel === "telegram") {
    if (!user.telegramChatId) return { ok: false, reason: "no_chat_id" };
    const r = await sendTelegramRaw(user.telegramChatId, variants.telegram.body, {
      parseMode: variants.telegram.parse_mode,
    });
    return r.ok
      ? { ok: true }
      : { ok: false, reason: r.reason, error: r.error };
  }
  return { ok: false, reason: "unknown_channel" };
}

async function dispatch(
  user: UserChannelInfo,
  variants: MessageVariants,
  organizationId: string,
  brand?: BrandId,
): Promise<DropInDispatchResult> {
  const order = resolveChannelOrder(user);
  if (order.length === 0) {
    return { ok: false, reason: "no_channel_available" };
  }
  let lastReason: string | undefined;
  let lastError: string | undefined;
  for (const channel of order) {
    const r = await deliverOnce(channel, variants, user, organizationId, brand);
    if (r.ok) return { ok: true, channel };
    lastReason = r.reason;
    lastError = r.error;
  }
  return { ok: false, reason: lastReason ?? "all_channels_failed", error: lastError };
}

function publicAppUrl(brand?: BrandId): string {
  return originForBrand(brand) ?? (import.meta.env.PUBLIC_APP_URL ?? "http://localhost:4321");
}

function recipientFromUser(u: UserChannelInfo): DropInMessageRecipient {
  return { id: u.id, email: u.email, firstName: u.firstName };
}

function baseCtx(
  session: SessionContextRow,
  recipient: DropInMessageRecipient,
  brand?: BrandId,
): DropInBaseContext {
  return {
    recipient,
    session: {
      id: session.sessionId,
      sportOrClassLabel: session.sportOrClassLabel,
      formatLabel: session.formatLabel,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      kind: session.kind,
    },
    venue: {
      id: session.venueId,
      name: session.venueName,
      timezone: session.venueTimezone,
    },
    publicAppUrl: publicAppUrl(brand),
    brand,
  };
}

// ---------- Public dispatch entry points ----------

/**
 * Dispatch booking confirmation. `brand` is derived from Stripe Checkout
 * Session metadata (set at checkout creation time, PR #168). For online
 * bookings the webhook handler reads `session.metadata.brand` and passes it
 * here. For walk-up / free bookings created without a Checkout Session, brand
 * defaults to "aspire" (no brand column on drop_in_bookings yet).
 */
export async function dispatchBookingConfirmation(
  bookingId: string,
  brand?: BrandId,
): Promise<DropInDispatchResult> {
  const booking = await loadBooking(bookingId);
  if (!booking) return { ok: false, reason: "booking_not_found" };
  const session = await loadSessionContext(booking.sessionId);
  if (!session) return { ok: false, reason: "session_not_found" };
  const user = await loadUser(booking.userId);
  if (!user) return { ok: false, reason: "user_not_found" };

  const resolvedBrand = brand ?? "aspire";
  const ctx: BookingConfirmationContext = {
    ...baseCtx(session, recipientFromUser(user), resolvedBrand),
    booking: {
      id: booking.id,
      amountPaidCents: booking.amountPaidCents,
      paymentMethod: booking.paymentMethod,
      teamAssignment: booking.teamAssignment,
    },
    source: booking.source,
  };

  const variants = await renderBookingConfirmation(ctx);
  return await dispatch(user, variants, session.organizationId, resolvedBrand);
}

/**
 * Dispatch waitlist-promoted notification. Brand is read from the booking row
 * (drop_in_bookings.brand column, added in migration 0042).
 */
export async function dispatchWaitlistPromoted(
  bookingId: string,
  promotionToken: string,
  promotionExpiresAt: Date,
): Promise<DropInDispatchResult> {
  const booking = await loadBooking(bookingId);
  if (!booking) return { ok: false, reason: "booking_not_found" };
  const session = await loadSessionContext(booking.sessionId);
  if (!session) return { ok: false, reason: "session_not_found" };
  const user = await loadUser(booking.userId);
  if (!user) return { ok: false, reason: "user_not_found" };

  const brand: BrandId = booking.brand;
  const ctx: WaitlistPromotedContext = {
    ...baseCtx(session, recipientFromUser(user), brand),
    booking: {
      id: booking.id,
      amountPaidCents: booking.amountPaidCents,
      paymentMethod: booking.paymentMethod,
      teamAssignment: booking.teamAssignment,
    },
    promotionToken,
    promotionExpiresAt,
  };

  const variants = await renderWaitlistPromoted(ctx);
  return await dispatch(user, variants, session.organizationId, brand);
}

/**
 * Dispatch admin-cancelled notification. Brand is read from the booking row
 * (drop_in_bookings.brand column, added in migration 0042).
 */
export async function dispatchBookingCancelledByAdmin(
  bookingId: string,
  opts: {
    reason: "session_cancelled" | "admin_refund";
    refunded: boolean;
  },
): Promise<DropInDispatchResult> {
  const booking = await loadBooking(bookingId);
  if (!booking) return { ok: false, reason: "booking_not_found" };
  const session = await loadSessionContext(booking.sessionId);
  if (!session) return { ok: false, reason: "session_not_found" };
  const user = await loadUser(booking.userId);
  if (!user) return { ok: false, reason: "user_not_found" };

  const brand: BrandId = booking.brand;
  const ctx: BookingCancelledByAdminContext = {
    ...baseCtx(session, recipientFromUser(user), brand),
    booking: {
      id: booking.id,
      amountPaidCents: booking.amountPaidCents,
      paymentMethod: booking.paymentMethod,
      teamAssignment: booking.teamAssignment,
    },
    reason: opts.reason,
    refunded: opts.refunded,
  };

  const variants = await renderBookingCancelledByAdmin(ctx);
  return await dispatch(user, variants, session.organizationId, brand);
}
