import type { APIRoute } from "astro";
import { randomUUID } from "node:crypto";
import { getSignedPutUrl } from "@/lib/storage/r2";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { verifyTurnstile } from "@/lib/auth/turnstile";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * POST /api/public/careers/upload-url
 *
 * Issues a short-lived presigned R2 PUT for host-application media. Direct-
 * to-R2 because Netlify function bodies cap far below video size (~6MB).
 * The returned `key` is what the apply form submits back (validated against
 * the careers/hosts/ prefix by jobApplicationSchema).
 *
 * NOTE (ops, one-time): the R2 bucket needs a CORS rule allowing PUT from
 * the app origins for browser uploads to succeed. Documented in the PR.
 */
// Client mirrors these limits via /api hints; import server-side only.
export const HOST_UPLOAD_LIMITS = {
  photo: {
    maxBytes: 5 * 1024 * 1024,
    types: { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" },
  },
  motivation_video: {
    maxBytes: 100 * 1024 * 1024,
    types: { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" },
  },
  demo_video: {
    maxBytes: 100 * 1024 * 1024,
    types: { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" },
  },
} as const;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const ip = clientAddress ?? "unknown";
  const limit = rateLimit(`careers-upload-url:ip:${ip}`, 10, 60_000);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfter ?? 60);

  let body: {
    kind?: string;
    contentType?: string;
    sizeBytes?: number;
    turnstileToken?: string;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  // CAPTCHA — same fail-closed-in-prod/fail-open-in-dev contract as apply.ts.
  // This endpoint mints a real (if short-lived) write credential to R2, so it
  // needs the same bot gate as the form submission it precedes.
  const turnstileOk = await verifyTurnstile(body.turnstileToken ?? "", {
    secret: import.meta.env.TURNSTILE_SECRET_KEY as string | undefined,
    isProd: Boolean(import.meta.env.PROD),
  });
  if (!turnstileOk) {
    return json({ error: "Please complete the CAPTCHA challenge before continuing." }, 400);
  }

  const kind = body.kind as keyof typeof HOST_UPLOAD_LIMITS;
  const spec = HOST_UPLOAD_LIMITS[kind];
  if (!spec) return json({ error: "Unknown upload kind" }, 400);

  const ext = spec.types[body.contentType as keyof typeof spec.types];
  if (!ext) return json({ error: "Unsupported file type" }, 400);

  const size = Number(body.sizeBytes);
  if (!Number.isFinite(size) || size <= 0 || size > spec.maxBytes) {
    return json(
      { error: `File must be ${Math.round(spec.maxBytes / 1024 / 1024)} MB or smaller` },
      400,
    );
  }

  const key = `careers/hosts/${randomUUID()}.${ext}`;
  let url: string;
  try {
    url = await getSignedPutUrl(key, String(body.contentType), { contentLength: size });
  } catch (err) {
    // R2 env absent (local dev without storage config) — tell the client to
    // degrade to link inputs. Never a 500: this is an expected local state.
    console.warn("[careers] upload-url unavailable (R2 not configured)", err);
    return json({ error: "Uploads unavailable", code: "storage_unavailable" }, 503);
  }
  return json({ url, key }, 200);
};
