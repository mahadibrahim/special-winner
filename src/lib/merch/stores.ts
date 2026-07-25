import { getDb } from "@/lib/db";
import { and, asc, desc, eq } from "drizzle-orm";
import { merchStores, type MerchStore } from "@/lib/db/schema";

export const GENERAL_STORE_SLUG = "general";

export function generateShareToken(): string {
  return crypto.randomUUID().replace(/-/g, "");
}

export function storeWindowState(
  store: { orderOpensAt: Date | null; orderClosesAt: Date | null },
  now: Date,
): "not_open" | "open" | "closed" {
  if (store.orderOpensAt && now < store.orderOpensAt) return "not_open";
  if (store.orderClosesAt && now > store.orderClosesAt) return "closed";
  return "open";
}

export function isStoreShoppable(
  store: { active: boolean; orderOpensAt: Date | null; orderClosesAt: Date | null },
  now: Date,
): boolean {
  return store.active && storeWindowState(store, now) === "open";
}

/** The org's single general storefront (scope='general'). Deterministic order. */
export async function getGeneralStore(orgId: string): Promise<MerchStore | null> {
  const [row] = await getDb().select().from(merchStores)
    .where(and(eq(merchStores.organizationId, orgId), eq(merchStores.scope, "general")))
    .orderBy(asc(merchStores.createdAt)).limit(1);
  return row ?? null;
}

/** Get-or-create the org's general store (used by first-time Printful sync). */
export async function ensureGeneralStore(orgId: string, orgName: string): Promise<MerchStore> {
  const existing = await getGeneralStore(orgId);
  if (existing) return existing;
  const [row] = await getDb().insert(merchStores).values({
    organizationId: orgId, scope: "general", name: `${orgName} Shop`,
    slug: GENERAL_STORE_SLUG, visibility: "public",
  }).returning();
  return row;
}

export async function getStoreBySlug(orgId: string, slug: string): Promise<MerchStore | null> {
  const [row] = await getDb().select().from(merchStores)
    .where(and(eq(merchStores.organizationId, orgId), eq(merchStores.slug, slug)))
    .orderBy(asc(merchStores.createdAt)).limit(1);
  return row ?? null;
}

export async function getStoreByToken(token: string): Promise<MerchStore | null> {
  const [row] = await getDb().select().from(merchStores)
    .where(eq(merchStores.shareToken, token)).limit(1);
  return row ?? null;
}

export async function listStores(orgId: string): Promise<MerchStore[]> {
  return getDb().select().from(merchStores)
    .where(eq(merchStores.organizationId, orgId))
    .orderBy(asc(merchStores.sortOrder), desc(merchStores.createdAt));
}

export async function getStoreById(orgId: string, id: string): Promise<MerchStore | null> {
  const [row] = await getDb().select().from(merchStores)
    .where(and(eq(merchStores.id, id), eq(merchStores.organizationId, orgId))).limit(1);
  return row ?? null;
}
