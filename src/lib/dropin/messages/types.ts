/**
 * Drop-in messaging types + shared formatting helpers.
 *
 * Re-uses the same `MessageVariants` shape as the activity-tracking
 * dispatcher (sms / email / telegram). Each renderer takes a typed
 * context object — booking, session, venue, recipient, plus optional
 * promotion-claim metadata for the waitlist-promoted variant — and
 * returns the per-channel bodies. Channel selection lives in the
 * dispatcher (`dispatch.ts`), which respects the recipient's stored
 * primary/fallback channel preference.
 */
import type { BrandId } from "@/lib/branding/themes";
export interface MessageVariants {
  sms: { body: string };
  email: { subject: string; html: string; text: string };
  telegram: { body: string; parse_mode: "HTML" };
}

export interface DropInMessageRecipient {
  id: string;
  email: string | null;
  firstName: string | null;
}

export interface DropInMessageSession {
  id: string;
  sportOrClassLabel: string;
  formatLabel?: string | null;
  startsAt: Date;
  endsAt: Date;
  kind: "pickup" | "class";
}

export interface DropInMessageVenue {
  id: string;
  name: string;
  timezone?: string | null;
}

export interface DropInMessageBooking {
  id: string;
  amountPaidCents: number;
  paymentMethod: string;
  teamAssignment: string | null;
}

export interface DropInBaseContext {
  recipient: DropInMessageRecipient;
  session: DropInMessageSession;
  venue: DropInMessageVenue;
  publicAppUrl: string;
  /** Storefront brand the booking was created through. Defaults to "aspire".
   *  For online Checkout Sessions, derived from session.metadata.brand.
   *  For admin walk-up / waitlist-promoted / cancellations, read from
   *  drop_in_bookings.brand (added in migration 0042). */
  brand?: BrandId;
}

export interface BookingConfirmationContext extends DropInBaseContext {
  booking: DropInMessageBooking;
  source: "online_booking" | "walk_up";
  /**
   * Sign-the-waiver backstop link — set ONLY while the booking's waiver is
   * unsigned (the online flows capture it after payment). Null/absent when
   * already signed; the confirmation then omits the waiver CTA entirely.
   */
  signWaiverUrl?: string | null;
}

export interface WaitlistPromotedContext extends DropInBaseContext {
  booking: DropInMessageBooking;
  /** The one-time promotion token used to construct the claim link. */
  promotionToken: string;
  /** When the claim window closes — used to render "claim within Xm" copy. */
  promotionExpiresAt: Date;
}

export interface PaymentReminderContext extends DropInBaseContext {
  /** When the payment hold (promotionExpiresAt) closes. */
  expiresAt: Date;
  /** Self-serve link the recipient uses to complete payment. */
  selfServeUrl: string;
}

export interface OverflowRefundedContext extends DropInBaseContext {
  booking: DropInMessageBooking;
}

export interface BookingCancelledByAdminContext extends DropInBaseContext {
  booking: DropInMessageBooking;
  /**
   * Whether the entire session was cancelled (different copy) or this
   * specific booking was admin-refunded but the session is still on.
   */
  reason: "session_cancelled" | "admin_refund";
  refunded: boolean;
}

export function dollars(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function formatSessionTime(d: Date, tz?: string | null): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz ?? "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export function minutesUntil(target: Date, now: Date = new Date()): number {
  return Math.round((target.getTime() - now.getTime()) / 60_000);
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function sessionDetailLink(ctx: DropInBaseContext): string {
  return `${ctx.publicAppUrl}/dropin/${ctx.session.id}`;
}

export function claimLink(ctx: WaitlistPromotedContext): string {
  return `${ctx.publicAppUrl}/dropin/claim/${ctx.promotionToken}`;
}

export function recipientName(ctx: { recipient: DropInMessageRecipient }): string {
  return ctx.recipient.firstName?.trim() || "there";
}
