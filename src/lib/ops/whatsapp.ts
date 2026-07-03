import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, type OrganizationSettings } from "@/lib/db/schema";
import {
  createZernioClientFromEnv,
  isZernioConfigured,
  type ZernioClient,
} from "@/lib/zernio/messaging";

type ZernioEnv = { ZERNIO_API_KEY?: string; ZERNIO_ACCOUNT_ID?: string };

/** WhatsApp channel usable: credentials present + group provisioned. */
export function isOpsWhatsAppReady(
  settings: OrganizationSettings,
  env?: ZernioEnv,
): boolean {
  return (
    isZernioConfigured(env) &&
    Boolean(settings.opsPings?.whatsapp?.conversationId)
  );
}

/**
 * Post one message to the provisioned ops group. Throws on any failure —
 * the emitter (ping.ts) owns the email-fallback decision.
 */
export async function postToOpsGroup(
  settings: OrganizationSettings,
  text: string,
  client?: ZernioClient,
): Promise<void> {
  const conversationId = settings.opsPings?.whatsapp?.conversationId;
  if (!conversationId) {
    throw new Error("Ops WhatsApp group not provisioned (no conversationId)");
  }
  const zernio = client ?? createZernioClientFromEnv();
  await zernio.sendInboxMessage({ conversationId, message: text });
}

/**
 * Create the ops group once and persist ids into settings.opsPings.whatsapp.
 * Idempotent: returns the stored ids when already provisioned. Mirrors
 * provisionWhatsAppGroup in src/lib/messaging/group-lifecycle.ts.
 *
 * Note on conversationId: Zernio exposes the group as an inbox conversation.
 * The create response's groupId doubles as the conversation id for
 * wa-group conversations (the seam team groups already rely on); we store
 * both fields separately so a future divergence is a data fix, not code.
 */
export async function provisionOpsGroup(
  organizationId: string,
  client?: ZernioClient,
): Promise<{ groupId: string; conversationId: string | null; inviteLink: string | null }> {
  const db = getDb();
  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  if (!org) throw new Error(`Organization ${organizationId} not found`);
  const settings = (org.settings ?? {}) as OrganizationSettings;

  const existing = settings.opsPings?.whatsapp;
  if (existing?.groupId) {
    return {
      groupId: existing.groupId,
      conversationId: existing.conversationId ?? null,
      inviteLink: existing.inviteLink ?? null,
    };
  }

  const zernio = client ?? createZernioClientFromEnv();
  const created = await zernio.createWhatsAppGroup({
    subject: "Aspire Sports — Ops",
    description:
      "Operational pings: registrations, bookings, rentals, payments across Aspire + SoccerOne.",
    joinApprovalMode: "approval_required",
  });
  const inviteLink =
    created.inviteLink ??
    (await zernio.createGroupInviteLink({ groupId: created.groupId }));

  const whatsapp = {
    groupId: created.groupId,
    conversationId: created.groupId,
    inviteLink: inviteLink ?? undefined,
  };
  await db
    .update(organizations)
    .set({
      settings: {
        ...settings,
        opsPings: { ...(settings.opsPings ?? {}), whatsapp },
      },
    })
    .where(eq(organizations.id, organizationId));

  return {
    groupId: whatsapp.groupId,
    conversationId: whatsapp.conversationId,
    inviteLink: inviteLink ?? null,
  };
}

/** Push the configured principals into the group (Zernio chunks at 8). */
export async function syncOpsGroupMembers(
  organizationId: string,
  client?: ZernioClient,
): Promise<void> {
  const db = getDb();
  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  const settings = (org?.settings ?? {}) as OrganizationSettings;
  const groupId = settings.opsPings?.whatsapp?.groupId;
  const phones = (settings.opsPings?.principals ?? []).map((p) => p.phone);
  if (!groupId || phones.length === 0) return;

  const zernio = client ?? createZernioClientFromEnv();
  await zernio.addGroupParticipants({ groupId, phoneNumbers: phones });
}
