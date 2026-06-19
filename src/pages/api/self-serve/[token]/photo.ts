import type { APIRoute } from "astro";
import { verifyToken } from "@/lib/check-in/tokens-db";
import { resolveSigner } from "@/lib/check-in/resolve-signer";
import { uploadPhoto } from "@/lib/check-in/photo-upload";

export const prerender = false;
const json = (b: unknown, s: number) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async ({ params, request }) => {
  const tokenValue = params.token;
  if (!tokenValue) return json({ error: "Token required" }, 400);
  const v = await verifyToken(tokenValue);
  if (!v.ok) {
    const status = v.reason === "expired" || v.reason === "consumed" ? 410 : 404;
    return json({ error: v.reason }, status);
  }
  const tok = v.token;

  const form = await request.formData();
  const file = form.get("file") as File | null;
  if (!file) return json({ error: "file required" }, 400);

  const signer = await resolveSigner(tok.kind, tok.targetId, tok.organizationId);
  // walkin_session: resolveSigner returns null by design — the token row
  // carries the freshly-minted user's id in recipientUserId. Other kinds
  // populate signer.recipientUserId.
  const userId = signer?.recipientUserId ?? tok.recipientUserId;
  const target = signer?.isMinor && signer.familyMemberId
    ? { kind: "family_member" as const, id: signer.familyMemberId }
    : userId
      ? { kind: "user" as const, id: userId }
      : null;
  if (!target) return json({ error: "No photo target" }, 422);

  const bytes = Buffer.from(await file.arrayBuffer());
  const result = await uploadPhoto({ bytes, contentType: file.type, target });
  if (!result.ok) {
    const status = result.reason === "too_big" ? 413 : result.reason === "bad_type" ? 415 : 500;
    return json({ error: result.reason }, status);
  }
  return json({ url: result.url }, 200);
};
