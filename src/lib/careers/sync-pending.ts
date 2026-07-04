import { and, isNull, gte } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { jobApplications } from "@/lib/db/schema";
import { createNotionApplicationPage, isNotionConfigured } from "@/lib/notion/ats";

/**
 * Retry Notion sync for applications that stored locally but never made it
 * to the Hiring Pipeline (Notion outage, or env configured after launch).
 * 30-day lookback keeps the sweep bounded on the accumulating table.
 */
export async function syncPendingApplications(): Promise<{ attempted: number; synced: number }> {
  if (!isNotionConfigured()) return { attempted: 0, synced: 0 };
  const db = getDb();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const pending = await db
    .select()
    .from(jobApplications)
    .where(and(isNull(jobApplications.notionSyncedAt), gte(jobApplications.createdAt, cutoff)))
    .limit(25); // Notion rate limit is ~3 rps; 25/hour is plenty at our volume

  let synced = 0;
  for (const app of pending) {
    const pageId = await createNotionApplicationPage(app);
    if (pageId) {
      await db
        .update(jobApplications)
        .set({ notionPageId: pageId, notionSyncedAt: new Date() })
        .where(eq(jobApplications.id, app.id));
      synced++;
    }
  }
  return { attempted: pending.length, synced };
}
