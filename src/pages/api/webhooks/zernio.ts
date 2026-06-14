import type { APIRoute } from "astro";
import { verifyZernioSignature } from "@/lib/zernio/verifySignature";
import {
  getNotionConfigFromEnv,
  markPublished,
  markSyncError,
} from "@/lib/zernio/notionWriteback";
import {
  parseInboundWhatsAppMessage,
  handleInboundWhatsApp,
} from "@/lib/messaging/inbound-whatsapp";

/**
 * POST /api/webhooks/zernio
 *
 * Receives Zernio publish-confirmation webhooks for organic social posts and
 * writes the result back to the marketing Content Calendar (Notion). This is
 * sub-project 2b of the marketing engine; the ops push routine (2a) wrote the
 * `Zernio post ID` onto each row, which is the only correlation key here.
 *
 * Security: every request carries `X-Zernio-Signature` = lowercase-hex
 * HMAC-SHA256 of the raw body keyed with `ZERNIO_WEBHOOK_SECRET`. We verify it
 * before trusting the payload; a bad/missing signature is a hard 401.
 *
 * Event routing:
 *  - `post.published`          → markPublished (Live URL + Status=Published)
 *  - `post.failed` / `.partial`→ markSyncError (record the failure; no silent
 *                                drops per the design's error-handling rule)
 *  - any other event           → 200 no-op
 *
 * Idempotency / retry semantics (Zernio retries non-2xx up to 7x):
 *  - already-published row     → markPublished no-ops → 200
 *  - unknown post id           → 200 + log (do NOT 5xx; avoids a retry storm)
 *  - Notion write throws       → 5xx so Zernio retries
 *
 * Ack budget: Zernio expects a 2xx within 5s. We deliberately process the
 * single Notion query+patch synchronously rather than ack-first, because a
 * Notion failure must surface as a retriable 5xx (see §5.5 of the design). One
 * query + one patch is well under the 5s budget; idempotency makes retries safe.
 */

export const prerender = false;

interface ZernioWebhookPayload {
  id?: string;
  event?: string;
  timestamp?: string;
  error?: string;
  post?: {
    _id?: string;
    // Live-URL field name is UNCONFIRMED in Zernio's public docs — accept the
    // documented candidates. Pin the real one against a live test payload.
    url?: string;
    permalink?: string;
    liveUrl?: string;
    // Error-message field name is likewise UNCONFIRMED.
    error?: string;
    errorMessage?: string;
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function extractLiveUrl(post: ZernioWebhookPayload["post"]): string {
  return post?.url ?? post?.permalink ?? post?.liveUrl ?? "";
}

function extractError(payload: ZernioWebhookPayload): string {
  return (
    payload.post?.error ??
    payload.post?.errorMessage ??
    payload.error ??
    "Unknown publish error"
  );
}

export const POST: APIRoute = async ({ request }) => {
  // `import.meta.env` is inlined at build time; the `process.env` fallback makes
  // this a runtime read so a rotated/late-set Netlify secret applies without a
  // rebuild (matches notionWriteback's pattern).
  const secret =
    import.meta.env.ZERNIO_WEBHOOK_SECRET ?? process.env.ZERNIO_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[zernio webhook] ZERNIO_WEBHOOK_SECRET not configured");
    return json({ error: "Webhook not configured" }, 500);
  }

  // Read the RAW body for signature verification (do not re-serialize).
  const rawBody = await request.text();
  const signature = request.headers.get("x-zernio-signature");

  if (!verifyZernioSignature(rawBody, signature, secret)) {
    return json({ error: "Invalid signature" }, 401);
  }

  let payload: ZernioWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as ZernioWebhookPayload;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  // Inbound WhatsApp 1:1 message? Zernio delivers inbound messages to this same
  // registered webhook as the social-publish confirmations. parseInbound… is
  // conservative — it returns null for any event carrying `post` (every social
  // event does), so the publish-confirmation path below is never disturbed.
  const inbound = parseInboundWhatsAppMessage(payload);
  if (inbound) {
    // Record synchronously, then route through the pipeline fire-and-forget
    // (handleInboundWhatsApp does this internally) to hold the ~5s ack budget.
    const result = await handleInboundWhatsApp(inbound);
    return json({ received: true, kind: "inbound_whatsapp", ...result });
  }

  const event = payload.event;
  const postId = payload.post?._id;

  if (!postId) {
    console.warn(`[zernio webhook] ${event ?? "?"} missing post._id; ignoring`);
    return json({ received: true, skipped: "no post id" });
  }

  try {
    const config = getNotionConfigFromEnv();

    switch (event) {
      case "post.published": {
        const liveUrl = extractLiveUrl(payload.post);
        if (!liveUrl) {
          console.warn(
            `[zernio webhook] post.published ${postId} had no live URL field; ` +
              "publishing without one (verify the Zernio payload field name)",
          );
        }
        const result = await markPublished(postId, liveUrl, config);
        if (!result.matched) {
          console.warn(`[zernio webhook] no Content Calendar row for post ${postId}`);
        }
        return json({ received: true, ...result });
      }

      case "post.failed":
      case "post.partial": {
        const result = await markSyncError(postId, extractError(payload), config);
        if (!result.matched) {
          console.warn(`[zernio webhook] no Content Calendar row for post ${postId}`);
        }
        return json({ received: true, ...result });
      }

      default:
        return json({ received: true, skipped: `unhandled event ${event}` });
    }
  } catch (err) {
    // Notion write failed (or env misconfig) — return 5xx so Zernio retries.
    console.error("[zernio webhook] writeback failed:", err);
    return json({ error: "Writeback failed" }, 500);
  }
};
