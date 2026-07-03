import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { opsPings, organizations, type OrganizationSettings, type OpsPingChannel } from "@/lib/db/schema";
import { captureServerException } from "@/lib/observability/server-error";
import {
  formatOpsPingMessage,
  INSTANT_KINDS,
  OPS_PING_RATE_LIMIT_PER_HOUR,
  type OpsPingEvent,
} from "./format";
import { isOpsWhatsAppReady, postToOpsGroup } from "./whatsapp";
import { sendOpsPingFallbackEmail } from "@/lib/email/send";
import type { BrandId } from "@/lib/branding/themes";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Emit one operational ping. Fire-and-forget: never throws into the calling
 * business flow — all failures are logged + captured. Returns the channel the
 * ping resolved to ("disabled" when the master switch is off) purely for the
 * admin test endpoint's feedback; business call sites ignore the result.
 */
export async function sendOpsPing(
  organizationId: string,
  event: OpsPingEvent,
): Promise<OpsPingChannel | "disabled" | "deduped"> {
  try {
    return await emit(organizationId, event);
  } catch (err) {
    console.error(`[ops] ping failed (${event.kind}/${event.eventId}):`, err);
    void captureServerException(err, { component: "ops/ping" });
    return "suppressed";
  }
}

async function emit(
  organizationId: string,
  event: OpsPingEvent,
): Promise<OpsPingChannel | "disabled" | "deduped"> {
  const db = getDb();
  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  const settings = (org?.settings ?? {}) as OrganizationSettings;
  if (settings.opsPings?.enabled !== true) return "disabled";

  const message = formatOpsPingMessage(event);

  // Insert-first: the unique (kind, eventId) index is the dedupe gate —
  // webhook retries conflict here and stop.
  const inserted = await db
    .insert(opsPings)
    .values({
      organizationId,
      kind: event.kind,
      eventId: event.eventId,
      brand: event.brand,
      message,
      channel: "suppressed",
    })
    .onConflictDoNothing()
    .returning({ id: opsPings.id });
  if (inserted.length === 0) return "deduped";
  const rowId = inserted[0].id;

  // Digest-only kinds stop here; the row is the digest's material.
  if (!INSTANT_KINDS.has(event.kind)) return "suppressed";

  // Rolling-hour rate cap over instant kinds that actually delivered.
  // Soft/advisory cap: check-then-act, so concurrent emits can overshoot
  // by the concurrency depth — accepted.
  const windowStart = new Date(Date.now() - HOUR_MS);
  const [recent] = await db
    .select({ count: sql<number>`count(*)` })
    .from(opsPings)
    .where(
      and(
        eq(opsPings.organizationId, organizationId),
        gte(opsPings.createdAt, windowStart),
        inArray(opsPings.channel, ["whatsapp", "email"]),
      ),
    );
  const delivered = Number(recent.count);
  if (delivered >= OPS_PING_RATE_LIMIT_PER_HOUR) {
    await maybeSendCollapseNotice(organizationId, settings, windowStart);
    return "suppressed";
  }

  const channel = await deliver(settings, message, event.brand);
  await db.update(opsPings).set({ channel }).where(eq(opsPings.id, rowId));
  return channel;
}

/** WhatsApp first; email fallback; suppressed when neither is possible. */
async function deliver(
  settings: OrganizationSettings,
  message: string,
  brand: string,
): Promise<OpsPingChannel> {
  if (isOpsWhatsAppReady(settings)) {
    try {
      await postToOpsGroup(settings, message);
      return "whatsapp";
    } catch (err) {
      console.error("[ops] WhatsApp send failed, trying email fallback:", err);
    }
  }
  const fallbackTo =
    settings.feedback?.detractorAlertEmail ?? settings.contact?.supportEmail;
  if (fallbackTo) {
    const result = await sendOpsPingFallbackEmail({
      to: fallbackTo,
      brand: (brand === "soccerone" ? "soccerone" : "aspire") as BrandId,
      message,
    });
    if (result.success) return "email";
  }
  return "suppressed";
}

/**
 * At most one "…and N more" notice per rolling hour: send it only when no
 * other collapse notice row exists in the window.
 */
async function maybeSendCollapseNotice(
  organizationId: string,
  settings: OrganizationSettings,
  windowStart: Date,
): Promise<void> {
  const db = getDb();
  // Org-scoped: the (kind, eventId) unique index is global, so without the
  // org id two orgs overflowing in the same hour would collide and the
  // second org's notice would silently never send.
  const noticeEventId = `collapse-${organizationId}-${windowStart.toISOString().slice(0, 13)}`;
  const inserted = await db
    .insert(opsPings)
    .values({
      organizationId,
      kind: "test", // reuse enum: notices are operational meta-messages
      eventId: noticeEventId,
      brand: "aspire",
      message:
        "🔕 High volume — further pings this hour are collapsed. Full recap in the morning digest.",
      channel: "suppressed",
    })
    .onConflictDoNothing()
    .returning({ id: opsPings.id });
  if (inserted.length === 0) return; // notice already sent this hour

  const channel = await deliver(
    settings,
    "🔕 High volume — further pings this hour are collapsed. Full recap in the morning digest.",
    "aspire",
  );
  await db.update(opsPings).set({ channel }).where(eq(opsPings.id, inserted[0].id));
}
