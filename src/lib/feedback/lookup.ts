import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { feedbackRequests, type FeedbackRequest, type FeedbackRequestKind } from "@/lib/db/schema";
import { hashFeedbackToken } from "./tokens";
import type { BrandId } from "@/lib/branding/themes";

export interface FeedbackPageData {
  state: "open" | "responded" | "expired" | "not_found";
  kind?: FeedbackRequestKind;
  eventLabel?: string;
  brand?: BrandId;
  refereeName?: string;
}

/** Resolve a plaintext token to its request row, or null. */
export async function getFeedbackRequestByToken(
  token: string,
): Promise<FeedbackRequest | null> {
  if (!token || token.length > 128) return null;
  const [row] = await getDb()
    .select()
    .from(feedbackRequests)
    .where(eq(feedbackRequests.tokenHash, hashFeedbackToken(token)))
    .limit(1);
  return row ?? null;
}

/** Page-facing view of a token: which form to render, or which end state. */
export async function getFeedbackPageData(token: string): Promise<FeedbackPageData> {
  const row = await getFeedbackRequestByToken(token);
  if (!row) return { state: "not_found" };

  const base = {
    kind: row.kind,
    eventLabel: row.metadata?.eventLabel,
    brand: (row.brand === "soccerone" ? "soccerone" : "aspire") as BrandId,
    refereeName: row.metadata?.refereeName,
  };
  if (row.status === "responded") return { state: "responded", ...base };
  if (row.expiresAt < new Date()) return { state: "expired", ...base };
  return { state: "open", ...base };
}
