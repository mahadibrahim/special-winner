/**
 * DB-backed token mint / verify / consume. Pure value helpers live in
 * `./tokens.ts`. Manager + kiosk endpoints mint; self-serve endpoints
 * verify; self-serve consume endpoint marks final completion.
 *
 * Idempotent mint: if a live (unconsumed, unexpired) token exists for
 * the same (kind, targetId), reuse it instead of cluttering the table.
 */
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  selfServiceTokens,
  type SelfServiceToken,
  type NewSelfServiceToken,
} from "@/lib/db/schema/self-service-tokens";
import { generateTokenValue, isTokenShape } from "./tokens";

const DEFAULT_TTL_HOURS = 6;

export interface MintTokenInput {
  kind: NewSelfServiceToken["kind"];
  targetId: string;
  organizationId: string;
  venueId: string | null;
  sentVia: NewSelfServiceToken["sentVia"];
  recipientUserId: string | null;
  recipientEmail: string | null;
  recipientPhone: string | null;
  createdByUserId: string | null;
  ttlHours?: number;
}

export async function mintToken(
  input: MintTokenInput,
): Promise<SelfServiceToken> {
  const db = getDb();
  const now = new Date();

  const [live] = await db
    .select()
    .from(selfServiceTokens)
    .where(
      and(
        eq(selfServiceTokens.kind, input.kind),
        eq(selfServiceTokens.targetId, input.targetId),
        isNull(selfServiceTokens.consumedAt),
        gt(selfServiceTokens.expiresAt, now),
      ),
    )
    .orderBy(desc(selfServiceTokens.createdAt))
    .limit(1);
  if (live) return live;

  const ttl = (input.ttlHours ?? DEFAULT_TTL_HOURS) * 60 * 60 * 1000;
  const [row] = await db
    .insert(selfServiceTokens)
    .values({
      token: generateTokenValue(),
      kind: input.kind,
      targetId: input.targetId,
      organizationId: input.organizationId,
      venueId: input.venueId,
      sentVia: input.sentVia,
      recipientUserId: input.recipientUserId,
      recipientEmail: input.recipientEmail,
      recipientPhone: input.recipientPhone,
      createdByUserId: input.createdByUserId,
      expiresAt: new Date(now.getTime() + ttl),
    })
    .returning();
  return row;
}

export type VerifyResult =
  | { ok: true; token: SelfServiceToken }
  | { ok: false; reason: "bad_shape" | "not_found" | "expired" | "consumed" };

export async function verifyToken(value: string): Promise<VerifyResult> {
  if (!isTokenShape(value)) return { ok: false, reason: "bad_shape" };
  const db = getDb();
  const [row] = await db
    .select()
    .from(selfServiceTokens)
    .where(eq(selfServiceTokens.token, value))
    .limit(1);
  if (!row) return { ok: false, reason: "not_found" };
  if (row.expiresAt.getTime() < Date.now())
    return { ok: false, reason: "expired" };
  if (row.consumedAt != null) return { ok: false, reason: "consumed" };
  return { ok: true, token: row };
}

export async function consumeToken(
  id: string,
  consumedByIp: string | null,
): Promise<void> {
  await getDb()
    .update(selfServiceTokens)
    .set({ consumedAt: new Date(), consumedByIp })
    .where(eq(selfServiceTokens.id, id));
}
