import { getDb } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { merchOrders, merchOrderItems, merchVariants, merchProducts } from "@/lib/db/schema";
import { createPrintJob } from "@/lib/lulu/client";
import type { LuluPrintJobLineItemInput, LuluShippingLevel } from "@/lib/lulu/types";
import { toLuluAddress } from "./lulu-shipping";
import { getSignedGetUrl } from "@/lib/storage/r2";

/** Lulu fetches + normalizes the PDFs async and may retry — sign long. */
const BOOK_ASSET_URL_TTL_SECONDS = 72 * 60 * 60;

/** Under LULU_MOCK the print job never leaves the process, so don't require
 * live R2 creds just to mint a URL nobody will fetch. R2_MOCK alone does NOT
 * gate this: R2_MOCK=1 with Lulu live would mean a real, billable print job
 * submitted with a fake https://mock-r2.local/... asset URL Lulu can't
 * fetch. Only LULU_MOCK short-circuits the actual submission, so only
 * LULU_MOCK may short-circuit the URL it's submitted with. */
async function signBookAssetUrl(key: string): Promise<string> {
  if (process.env.LULU_MOCK === "1") {
    return `https://mock-r2.local/get/${key}`;
  }
  return getSignedGetUrl(key, { expiresInSeconds: BOOK_ASSET_URL_TTL_SECONDS });
}

/** Pure mapper; throws on a misconfigured line — submission must fail loudly
 * (the webhook's catch leaves the order 'paid' for retry) rather than print
 * a book with missing spec. */
export function buildLuluPrintJobLines(items: {
  productName: string;
  quantity: number;
  luluPodPackageId: string | null;
  luluPageCount: number | null;
  interiorUrl: string;
  coverUrl: string;
}[]): LuluPrintJobLineItemInput[] {
  return items.map((i) => {
    if (!i.luluPodPackageId || !i.luluPageCount || i.luluPageCount <= 0) {
      throw new Error(`lulu order line "${i.productName}" is missing its package id or page count`);
    }
    return {
      title: i.productName,
      podPackageId: i.luluPodPackageId,
      pageCount: i.luluPageCount,
      quantity: i.quantity,
      interiorUrl: i.interiorUrl,
      coverUrl: i.coverUrl,
    };
  });
}

export async function submitLuluOrder(orderId: string): Promise<{ luluPrintJobId: string }> {
  const db = getDb();
  const [order] = await db.select().from(merchOrders).where(eq(merchOrders.id, orderId)).limit(1);
  if (!order) throw new Error(`merch order not found: ${orderId}`);

  // Idempotency: never re-submit (mirrors fulfillMerchOrder's Printful guard).
  if (order.luluPrintJobId || order.status === "submitted" || order.status === "shipped") {
    return { luluPrintJobId: order.luluPrintJobId ?? "" };
  }

  const rows = await db
    .select({
      productName: merchOrderItems.productName,
      quantity: merchOrderItems.quantity,
      luluPodPackageId: merchProducts.luluPodPackageId,
      luluPageCount: merchProducts.luluPageCount,
      luluInteriorAssetKey: merchProducts.luluInteriorAssetKey,
      luluCoverAssetKey: merchProducts.luluCoverAssetKey,
    })
    .from(merchOrderItems)
    .innerJoin(merchVariants, eq(merchOrderItems.merchVariantId, merchVariants.id))
    .innerJoin(merchProducts, eq(merchVariants.productId, merchProducts.id))
    .where(and(eq(merchOrderItems.orderId, orderId), eq(merchOrderItems.fulfillmentType, "lulu_pod")));
  if (rows.length === 0) throw new Error(`merch order ${orderId} has no lulu_pod lines to submit`);

  const withUrls = await Promise.all(rows.map(async (r) => {
    if (!r.luluInteriorAssetKey || !r.luluCoverAssetKey) {
      throw new Error(`lulu order line "${r.productName}" is missing its interior/cover PDF`);
    }
    return {
      productName: r.productName,
      quantity: r.quantity,
      luluPodPackageId: r.luluPodPackageId,
      luluPageCount: r.luluPageCount,
      interiorUrl: await signBookAssetUrl(r.luluInteriorAssetKey),
      coverUrl: await signBookAssetUrl(r.luluCoverAssetKey),
    };
  }));

  const job = await createPrintJob({
    externalId: order.id,
    contactEmail: order.email,
    lineItems: buildLuluPrintJobLines(withUrls),
    address: toLuluAddress(order.shippingAddress),
    level: (order.luluShippingLevel ?? "MAIL") as LuluShippingLevel,
  });

  await db.update(merchOrders)
    .set({ luluPrintJobId: job.id, status: "submitted", updatedAt: new Date() })
    .where(eq(merchOrders.id, orderId));
  return { luluPrintJobId: job.id };
}
