import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";

const externalStoreSchema = z.object({
  url: z.string().url(),
  label: z.string().min(1).max(120),
  partnerName: z.enum(["Squadlocker", "BSN", "Custom Ink", "Other"]),
});

// Partial settings patch. Only keys present in the body are merged at the top
// level of the settings jsonb blob. Pass `null` for a key to delete it.
const settingsPatchSchema = z.object({
  externalStore: externalStoreSchema.nullable().optional(),
});

const bodySchema = z.object({
  settings: settingsPatchSchema,
});

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const [row] = await getDb()
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, orgContext.organizationId));

    if (!row) {
      return new Response(JSON.stringify({ error: "Organization not found" }), {
        status: 404,
      });
    }

    return new Response(JSON.stringify({ settings: row.settings ?? {} }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching organization settings:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch settings" }),
      { status: 500 },
    );
  }
};

export const PATCH: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  try {
    const body = await context.request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        }),
        { status: 400 },
      );
    }

    const [current] = await getDb()
      .select({ settings: organizations.settings })
      .from(organizations)
      .where(eq(organizations.id, orgContext.organizationId));

    if (!current) {
      return new Response(JSON.stringify({ error: "Organization not found" }), {
        status: 404,
      });
    }

    const existing = (current.settings ?? {}) as Record<string, unknown>;
    const patch = parsed.data.settings as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...existing };

    for (const [key, value] of Object.entries(patch)) {
      if (value === null) {
        delete merged[key];
      } else if (value !== undefined) {
        merged[key] = value;
      }
    }

    const [updated] = await getDb()
      .update(organizations)
      .set({ settings: merged as any, updatedAt: new Date() })
      .where(eq(organizations.id, orgContext.organizationId))
      .returning({ settings: organizations.settings });

    return new Response(JSON.stringify({ settings: updated.settings ?? {} }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error updating organization settings:", error);
    return new Response(
      JSON.stringify({ error: "Failed to update settings" }),
      { status: 500 },
    );
  }
};
