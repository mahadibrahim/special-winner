/**
 * Delete self_service_tokens rows whose `expiresAt` is older than 30
 * days ago. The 30-day grace preserves any tokens we might still need
 * to look at for support/audit; older rows can go without ceremony.
 */
import { lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { selfServiceTokens } from "@/lib/db/schema/self-service-tokens";

const GRACE_DAYS = 30;

export async function cleanupExpiredSelfServiceTokens(): Promise<{ deleted: number }> {
  const cutoff = new Date(Date.now() - GRACE_DAYS * 24 * 60 * 60 * 1000);
  const rows = await getDb()
    .delete(selfServiceTokens)
    .where(lt(selfServiceTokens.expiresAt, cutoff))
    .returning({ id: selfServiceTokens.id });
  return { deleted: rows.length };
}
