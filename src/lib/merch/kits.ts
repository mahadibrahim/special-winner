import { getDb } from "@/lib/db";
import { and, eq, desc } from "drizzle-orm";
import { merchTeamKits, type MerchTeamKit } from "@/lib/db/schema";

export function generateShareToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export function kitWindowState(
  kit: { orderOpensAt: Date | null; orderClosesAt: Date | null },
  now: Date,
): "not_open" | "open" | "closed" {
  if (kit.orderOpensAt && now < kit.orderOpensAt) return "not_open";
  if (kit.orderClosesAt && now > kit.orderClosesAt) return "closed";
  return "open";
}

export async function listKits(orgId: string): Promise<MerchTeamKit[]> {
  return getDb()
    .select()
    .from(merchTeamKits)
    .where(eq(merchTeamKits.organizationId, orgId))
    .orderBy(desc(merchTeamKits.createdAt));
}

export async function getKitById(orgId: string, id: string): Promise<MerchTeamKit | null> {
  const [row] = await getDb()
    .select()
    .from(merchTeamKits)
    .where(and(eq(merchTeamKits.id, id), eq(merchTeamKits.organizationId, orgId)))
    .limit(1);
  return row ?? null;
}

export async function getKitByToken(token: string): Promise<MerchTeamKit | null> {
  const [row] = await getDb()
    .select()
    .from(merchTeamKits)
    .where(eq(merchTeamKits.shareToken, token))
    .limit(1);
  return row ?? null;
}
