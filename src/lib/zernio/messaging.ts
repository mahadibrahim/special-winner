/**
 * Zernio messaging transport client.
 *
 * Thin typed wrapper over the Zernio API (https://zernio.com/api/v1) for the
 * WhatsApp messaging surface we use: inbox sends, WhatsApp group lifecycle, and
 * (later) templates. This is the transport layer only — opt-in checks,
 * conversation logging, channel fallback, and group-lifecycle orchestration
 * live in `src/lib/messaging/*`, which calls into this.
 *
 * `fetchImpl` is injectable so the client is unit-testable without global mocks.
 */

const DEFAULT_BASE_URL = "https://zernio.com/api/v1";

/** Zernio caps group participant adds at 8 per request. */
const MAX_PARTICIPANTS_PER_REQUEST = 8;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export interface ZernioClientConfig {
  apiKey: string;
  accountId: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export interface SendInboxMessageInput {
  conversationId: string;
  message: string;
}

export interface CreateWhatsAppGroupInput {
  subject: string;
  description?: string;
  joinApprovalMode?: "approval_required" | "auto_join";
}

export interface WhatsAppGroup {
  groupId: string;
  inviteLink: string | null;
}

export interface AddGroupParticipantsInput {
  groupId: string;
  phoneNumbers: string[];
}

/**
 * Normalize the create-group response. The exact envelope is unconfirmed in
 * Zernio's public docs (the SDK examples show `data.group`, the raw shape may be
 * `{ group }`), so accept both — same defensive stance as the webhook handler.
 */
function extractGroup(payload: unknown): WhatsAppGroup {
  const root = (payload ?? {}) as Record<string, unknown>;
  const data = (root.data ?? root) as Record<string, unknown>;
  const group = (data.group ?? {}) as Record<string, unknown>;
  const groupId = (group.groupId ?? group.id) as string | undefined;
  if (!groupId) {
    throw new Error("Zernio createWhatsAppGroup: no groupId in response");
  }
  return {
    groupId,
    inviteLink: (group.inviteLink as string | undefined) ?? null,
  };
}

export function createZernioClient(config: ZernioClientConfig) {
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const doFetch = config.fetchImpl ?? fetch;

  async function post(path: string, body: unknown): Promise<unknown> {
    const res = await doFetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  return {
    /** Send a text message to an existing inbox conversation (1:1 or group). */
    async sendInboxMessage(input: SendInboxMessageInput): Promise<unknown> {
      return post(`/inbox/conversations/${input.conversationId}/messages`, {
        accountId: config.accountId,
        message: input.message,
      });
    },

    /** Create a WhatsApp group chat; returns its id and (if present) invite link. */
    async createWhatsAppGroup(input: CreateWhatsAppGroupInput): Promise<WhatsAppGroup> {
      const body: Record<string, unknown> = {
        accountId: config.accountId,
        subject: input.subject,
      };
      if (input.description !== undefined) body.description = input.description;
      if (input.joinApprovalMode !== undefined) body.joinApprovalMode = input.joinApprovalMode;
      const res = await post("/whatsapp/wa-groups", body);
      return extractGroup(res);
    },

    /**
     * Add participants to a WhatsApp group. Zernio caps adds at 8 per request,
     * so longer rosters are split across sequential requests. No-ops on empty.
     */
    async addGroupParticipants(input: AddGroupParticipantsInput): Promise<void> {
      const accountId = encodeURIComponent(config.accountId);
      for (const batch of chunk(input.phoneNumbers, MAX_PARTICIPANTS_PER_REQUEST)) {
        await post(
          `/whatsapp/wa-groups/${input.groupId}/participants?accountId=${accountId}`,
          { phoneNumbers: batch },
        );
      }
    },

    /** Generate (or rotate) a group's public invite link. */
    async createGroupInviteLink(input: { groupId: string }): Promise<string | null> {
      const accountId = encodeURIComponent(config.accountId);
      const res = (await post(
        `/whatsapp/wa-groups/${input.groupId}/invite-link?accountId=${accountId}`,
        {},
      )) as Record<string, unknown>;
      const data = (res?.data ?? res ?? {}) as Record<string, unknown>;
      return (data.inviteLink as string | undefined) ?? null;
    },
  };
}
