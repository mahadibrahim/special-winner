import type { APIRoute } from "astro";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { jobApplications } from "@/lib/db/schema";
import { jobApplicationSchema } from "@/lib/careers/application-schema";
import { verifyTurnstile } from "@/lib/auth/turnstile";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { putObject } from "@/lib/storage/r2";
import { sendEmail, fromForBrand, isEmailConfigured } from "@/lib/email";
import { createNotionApplicationPage } from "@/lib/notion/ats";
import { sendOpsPing } from "@/lib/ops/ping";
import { brandFromHost } from "@/lib/organization/soccerone-routing";
import { escapeHtml } from "@/lib/activity-tracking/messages/types";

export const prerender = false;

const MAX_RESUME_BYTES = 5 * 1024 * 1024;
const HIRING_NOTIFY_EMAIL = "hello@aspiresportsohio.com";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  // Rate limit first — cheapest check (mirrors corporate-inquiry).
  const ip = clientAddress ?? "unknown";
  const ipLimit = rateLimit(`careers-apply:ip:${ip}`, 5, 60_000);
  if (!ipLimit.allowed) return rateLimitedResponse(ipLimit.retryAfter ?? 60);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Expected multipart form data" }, 400);
  }

  // CAPTCHA — fails closed in prod when secret unset, open in dev/CI
  // (same contract as forgot-password).
  const turnstileOk = await verifyTurnstile(String(form.get("turnstileToken") ?? ""), {
    secret: import.meta.env.TURNSTILE_SECRET_KEY as string | undefined,
    isProd: Boolean(import.meta.env.PROD),
  });
  if (!turnstileOk) {
    return json({ error: "Please complete the CAPTCHA challenge before continuing." }, 400);
  }

  const parsed = jobApplicationSchema.safeParse({
    role: form.get("role") ?? undefined,
    firstName: form.get("firstName") ?? undefined,
    lastName: form.get("lastName") ?? undefined,
    email: form.get("email") ?? undefined,
    phone: form.get("phone") || undefined,
    preferredLocation: form.get("preferredLocation") || undefined,
    certifications: form.get("certifications") || undefined,
    experience: form.get("experience") ?? undefined,
    availability: form.getAll("availability").map(String),
    source: form.get("source") || undefined,
  });
  if (!parsed.success) {
    return json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      400,
    );
  }

  // Optional resume: PDF only, ≤5MB, server-side put to R2. Key stored,
  // never a signed URL (they expire) — the admin endpoint redirects.
  let resumeKey: string | null = null;
  const resume = form.get("resume");
  if (resume instanceof File && resume.size > 0) {
    if (resume.type !== "application/pdf" || !resume.name.toLowerCase().endsWith(".pdf")) {
      return json({ error: "Resume must be a PDF" }, 400);
    }
    if (resume.size > MAX_RESUME_BYTES) {
      return json({ error: "Resume must be 5 MB or smaller" }, 400);
    }
    resumeKey = `careers/resumes/${randomUUID()}.pdf`;
    try {
      await putObject(resumeKey, new Uint8Array(await resume.arrayBuffer()), "application/pdf");
    } catch (err) {
      console.error("[careers] resume upload failed (continuing without)", err);
      resumeKey = null;
    }
  }

  const brand = brandFromHost(request.headers.get("host") ?? "");
  let application;
  try {
    [application] = await getDb()
      .insert(jobApplications)
      .values({
        organizationId: locals.organization?.id ?? null,
        brand,
        ...parsed.data,
        resumeKey,
      })
      .returning();
  } catch (err) {
    console.error("[careers] insert failed", err);
    return json(
      { error: `Could not submit your application. Please email ${HIRING_NOTIFY_EMAIL} directly.` },
      502,
    );
  }

  // Source of truth committed — everything below is best-effort and must
  // never turn the response into an error.
  const pageId = await createNotionApplicationPage(application);
  if (pageId) {
    try {
      await getDb()
        .update(jobApplications)
        .set({ notionPageId: pageId, notionSyncedAt: new Date() })
        .where(eq(jobApplications.id, application.id));
    } catch (err) {
      console.error("[careers] notion mark-synced failed", err);
    }
  }

  if (isEmailConfigured()) {
    const result = await sendEmail({
      from: fromForBrand(brand),
      to: HIRING_NOTIFY_EMAIL,
      subject: `New ${parsed.data.role} application — ${parsed.data.firstName} ${parsed.data.lastName}`,
      html: `<p><strong>${escapeHtml(parsed.data.firstName)} ${escapeHtml(parsed.data.lastName)}</strong> applied as <strong>${escapeHtml(parsed.data.role)}</strong>.</p>
<p>Email: ${escapeHtml(parsed.data.email)}<br/>Phone: ${escapeHtml(parsed.data.phone ?? "—")}<br/>Facility: ${escapeHtml(parsed.data.preferredLocation ?? "—")}</p>
<p>${escapeHtml((parsed.data.experience ?? "").slice(0, 500))}</p>
<p>Review in Notion or /admin/applications.</p>`,
    });
    if (!result.success) console.error("[careers] notify email failed", result.error);
  }

  // Ops ping (WhatsApp group → email fallback). Awaited, not fire-and-forget:
  // serverless freezes pending work after the response (same reason the
  // registration pings are awaited). sendOpsPing never throws.
  if (application.organizationId) {
    await sendOpsPing(application.organizationId, {
      kind: "job_application",
      brand,
      eventId: application.id,
      label: `${parsed.data.firstName} ${parsed.data.lastName.charAt(0)}. · ${parsed.data.role}`,
    });
  }

  return json({ ok: true, id: application.id }, 200);
};
