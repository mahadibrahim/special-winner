import type { APIRoute } from "astro";
import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { coachCredentials } from "@/lib/db/schema";
import { requireOrgAdminAccess } from "@/lib/auth";
import { putObject, getSignedGetUrl } from "@/lib/storage/r2";

export const prerender = false;

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

async function loadOrgCredential(orgId: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(coachCredentials)
    .where(
      and(
        eq(coachCredentials.id, id),
        eq(coachCredentials.organizationId, orgId),
      ),
    )
    .orderBy(asc(coachCredentials.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * POST — attach a PDF (≤5MB) to a credential. Same plumbing as the careers
 * resume upload: server-side put to R2, the object KEY is stored (signed
 * URLs expire), the GET below redirects to a fresh one.
 */
export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const id = context.params.id;
  if (!id) return json(400, { error: "id required" });

  const credential = await loadOrgCredential(auth.organizationId, id);
  if (!credential) return json(404, { error: "Resource not found" });

  let form: FormData;
  try {
    form = await context.request.formData();
  } catch {
    return json(400, { error: "Expected multipart form data" });
  }

  const document = form.get("document");
  if (!(document instanceof File) || document.size === 0) {
    return json(400, { error: "document file is required" });
  }
  if (
    document.type !== "application/pdf" ||
    !document.name.toLowerCase().endsWith(".pdf")
  ) {
    return json(400, { error: "Document must be a PDF" });
  }
  if (document.size > MAX_DOCUMENT_BYTES) {
    return json(400, { error: "Document must be 5 MB or smaller" });
  }

  const documentKey = `compliance/credentials/${randomUUID()}.pdf`;
  try {
    await putObject(
      documentKey,
      new Uint8Array(await document.arrayBuffer()),
      "application/pdf",
    );
  } catch (err) {
    console.error("[coach-credentials] document upload failed", err);
    return json(502, { error: "Could not store the document" });
  }

  await getDb()
    .update(coachCredentials)
    .set({ documentKey, updatedAt: new Date() })
    .where(eq(coachCredentials.id, credential.id));

  return json(200, { documentKey });
};

/**
 * GET — 302 to a fresh signed R2 URL for the credential's document
 * (mirrors applications/[id]/resume.ts, including the R2_MOCK contract).
 */
export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const id = context.params.id;
  if (!id) return json(400, { error: "id required" });

  const credential = await loadOrgCredential(auth.organizationId, id);
  if (!credential) return json(404, { error: "Resource not found" });
  if (!credential.documentKey) {
    return json(404, { error: "No document on this credential" });
  }

  if (process.env.R2_MOCK === "1") {
    return context.redirect(
      `https://mock-r2.local/${credential.documentKey}`,
      302,
    );
  }
  const url = await getSignedGetUrl(credential.documentKey);
  return context.redirect(url, 302);
};
