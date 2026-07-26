import { getDb } from "@/lib/db";
import { and, eq, isNotNull } from "drizzle-orm";
import { merchOrders } from "@/lib/db/schema";
import { getPrintJob } from "@/lib/lulu/client";
import { sendMerchShippedEmail } from "./order-confirmation-email";

export type LuluJobAction = "ship" | "fail" | "wait";

/** SHIPPED is terminal-success; REJECTED/CANCELED terminal-failure (surface
 * as a 'failed' order in admin — refund is a manual action in v1); everything
 * else is in-flight, poll again next tick. Unknown statuses wait (never fail
 * an order on a status we don't recognize). */
export function actionForLuluStatus(statusName: string): LuluJobAction {
  if (statusName === "SHIPPED") return "ship";
  if (statusName === "REJECTED" || statusName === "CANCELED") return "fail";
  return "wait";
}

/** Poll every submitted Lulu order's print job. Volume is low (books); no
 * batching. A single job's failure is logged and skipped — one bad job must
 * not starve the rest of the sweep. */
export async function pollLuluJobs(): Promise<{ checked: number; shipped: number; failed: number }> {
  const db = getDb();
  const open = await db.select().from(merchOrders)
    .where(and(eq(merchOrders.status, "submitted"), isNotNull(merchOrders.luluPrintJobId)));

  let shipped = 0, failed = 0;
  for (const order of open) {
    try {
      const job = await getPrintJob(order.luluPrintJobId as string);
      const action = actionForLuluStatus(job.status);
      if (action === "ship") {
        await db.update(merchOrders).set({
          status: "shipped",
          shippingCarrier: job.tracking.carrier?.slice(0, 60) ?? order.shippingCarrier,
          trackingNumber: job.tracking.trackingId?.slice(0, 120) ?? null,
          trackingUrl: job.tracking.trackingUrl?.slice(0, 500) ?? null,
          shippedAt: new Date(),
          updatedAt: new Date(),
        }).where(eq(merchOrders.id, order.id));
        try { await sendMerchShippedEmail(order.id); } catch (e) { console.error(`[merch] lulu shipped email failed for ${order.id}:`, e); }
        shipped++;
      } else if (action === "fail") {
        await db.update(merchOrders).set({ status: "failed", updatedAt: new Date() }).where(eq(merchOrders.id, order.id));
        console.error(`[merch] lulu print job ${order.luluPrintJobId} for order ${order.id} ended ${job.status} — order marked failed`);
        failed++;
      }
    } catch (e) {
      console.error(`[merch] lulu status poll failed for order ${order.id}:`, e);
    }
  }
  return { checked: open.length, shipped, failed };
}
