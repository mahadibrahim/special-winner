/**
 * POST /api/admin/check-in/upload-photo (multipart)
 * Body: kind=<...>&targetId=<...>&file=<binary>
 * Resolves the photo target via resolveSigner and runs the shared
 * upload pipeline.
 */
import type { APIRoute } from "astro";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { resolveSigner, type SelfServiceKind } from "@/lib/check-in/resolve-signer";
import { uploadPhoto } from "@/lib/check-in/photo-upload";

export const prerender = false;
const json = (b: unknown, s: number) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  const form = await context.request.formData();
  const kind = form.get("kind") as string | null;
  const targetId = form.get("targetId") as string | null;
  const file = form.get("file") as File | null;
  if (!kind || !targetId || !file)
    return json({ error: "kind, targetId, and file are required" }, 400);

  const signer = await resolveSigner(kind as SelfServiceKind, targetId, orgId);
  if (!signer) return json({ error: "Target not found" }, 404);

  // Choose target: family_member for minors (with familyMemberId); else user.
  const target: Parameters<typeof uploadPhoto>[0]["target"] | null = signer.isMinor && signer.familyMemberId
    ? { kind: "family_member", id: signer.familyMemberId }
    : signer.recipientUserId
      ? { kind: "user", id: signer.recipientUserId }
      : null;
  if (!target) return json({ error: "No photo target for this signer" }, 422);

  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await uploadPhoto({ bytes, contentType: file.type, target });
  if (!result.ok) {
    const status = result.reason === "too_big" ? 413 : result.reason === "bad_type" ? 415 : 500;
    return json({ error: result.reason }, status);
  }
  return json({ url: result.url }, 200);
};
