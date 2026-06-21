/**
 * POST /api/admin/person/[id]/photo?as=family_member|user (multipart)
 * Body: file=<binary>
 *
 * Admin-gated, org-scoped person photo upload. Resolves the person to a
 * `family_member` or `user` upload target, runs the shared upload pipeline,
 * and returns { url } on success.
 *
 * Mirrors the admin gate + org-scoping of GET /api/admin/person/[id].
 */
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { locations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { getEffectiveLocationIds } from "@/lib/admin/active-venue";
import { buildPersonProfile } from "@/lib/person/build-person-profile";
import { uploadPhoto } from "@/lib/check-in/photo-upload";

export const prerender = false;

const json = (b: unknown, s: number) =>
  new Response(JSON.stringify(b), {
    status: s,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async (context) => {
  // ── Auth gate ──────────────────────────────────────────────────────────────
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  // ── Validate params ────────────────────────────────────────────────────────
  const { id } = context.params;
  if (!id) {
    return json({ error: "Person ID required" }, 400);
  }

  const url = new URL(context.request.url);
  const asParam = url.searchParams.get("as");
  if (asParam !== "family_member" && asParam !== "user") {
    return json(
      { error: "Query param `as` must be `family_member` or `user`" },
      400,
    );
  }

  // ── Parse multipart ────────────────────────────────────────────────────────
  let file: File | null = null;
  try {
    const form = await context.request.formData();
    file = form.get("file") as File | null;
  } catch {
    return json({ error: "Invalid multipart request" }, 400);
  }
  if (!file) {
    return json({ error: "file is required" }, 400);
  }

  try {
    // ── Resolve effective location ids (mirrors [id].ts) ───────────────────
    const effectiveIds = await getEffectiveLocationIds({
      userId: auth.user.id,
      userRoles: auth.roles,
      activeLocationId: context.locals.activeLocationId,
    });

    let allowedLocationIds: string[];
    if (effectiveIds === null) {
      // Super-admin with no pin: all locations in org.
      const orgLocations = await getDb()
        .select({ id: locations.id })
        .from(locations)
        .where(eq(locations.organizationId, orgContext.organizationId));
      allowedLocationIds = orgLocations.map((l) => l.id);
    } else if (effectiveIds.length === 0) {
      return json({ error: "Not found" }, 404);
    } else {
      allowedLocationIds = effectiveIds;
    }

    // ── Org-scope check: confirm person belongs to this org ────────────────
    // We use buildPersonProfile as the org-scope oracle — it returns null if
    // the person is not in the caller's org. We don't need the full profile
    // data; we just need confirmation the person exists and is in-scope.
    const profile = await buildPersonProfile({
      id,
      as: asParam,
      orgId: orgContext.organizationId,
      allowedLocationIds,
    });

    if (!profile) {
      return json({ error: "Not found" }, 404);
    }

    // ── Resolve upload target ──────────────────────────────────────────────
    const target: Parameters<typeof uploadPhoto>[0]["target"] =
      asParam === "family_member"
        ? { kind: "family_member", id }
        : { kind: "user", id };

    // ── Upload ─────────────────────────────────────────────────────────────
    const bytes = Buffer.from(await file.arrayBuffer());
    const result = await uploadPhoto({ bytes, contentType: file.type, target });

    if (!result.ok) {
      const status =
        result.reason === "too_big"
          ? 413
          : result.reason === "bad_type"
            ? 415
            : 500;
      return json({ error: result.reason }, status);
    }

    return json({ url: result.url }, 200);
  } catch (err) {
    console.error("[/api/admin/person/[id]/photo]", err);
    return json({ error: "Internal server error" }, 500);
  }
};
