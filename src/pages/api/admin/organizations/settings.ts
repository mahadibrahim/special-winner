import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireOrgAdminAccess } from "@/lib/auth";
import { clearDomainCache } from "@/lib/organization/domain-resolver";

const externalStoreSchema = z.object({
  url: z.string().url(),
  label: z.string().min(1).max(120),
  partnerName: z.enum(["Squadlocker", "BSN", "Custom Ink", "Other"]),
});

const siteAnnouncementSchema = z.object({
  title: z.string().trim().min(1).max(120),
  detail: z.string().trim().max(240).optional(),
  linkUrl: z.string().trim().max(500).optional(),
  linkLabel: z.string().trim().max(60).optional(),
  audience: z.enum(["all", "adult", "youth"]),
  expiresAt: z.string().datetime({ offset: true }).optional(),
});

const feedbackSettingsSchema = z.object({
  googleReviewUrl: z
    .object({
      aspire: z.string().url().optional(),
      soccerone: z.string().url().optional(),
    })
    .optional(),
  detractorAlertEmail: z.string().email().optional(),
  // venueId -> review URL. Keys are not FK-validated here (venues can be
  // deleted later anyway); resolution simply misses and falls back.
  googleReviewUrlByVenue: z.record(z.string(), z.string().url()).optional(),
});

const opsPingsSchema = z.object({
  enabled: z.boolean().optional(),
  principals: z
    .array(z.object({ name: z.string().trim().min(1).max(100), phone: z.string().trim().min(7).max(30) }))
    .max(20)
    .optional(),
  whatsapp: z
    .object({
      groupId: z.string().optional(),
      conversationId: z.string().optional(),
      inviteLink: z.string().optional(),
    })
    .optional(),
});

const featuresPatchSchema = z.object({
  enableNpsSurveys: z.boolean().optional(),
  enableRefereeRatings: z.boolean().optional(),
});

// Partial settings patch. Only keys present in the body are merged at the top
// level of the settings jsonb blob. Pass `null` for a key to delete it.
const settingsPatchSchema = z.object({
  externalStore: externalStoreSchema.nullable().optional(),
  siteAnnouncement: siteAnnouncementSchema.nullable().optional(),
  feedback: feedbackSettingsSchema.nullable().optional(),
  opsPings: opsPingsSchema.nullable().optional(),
});

const bodySchema = z.object({
  settings: settingsPatchSchema.optional(),
  features: featuresPatchSchema.optional(),
});

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  try {
    const [row] = await getDb()
      .select({
        settings: organizations.settings,
        features: organizations.features,
      })
      .from(organizations)
      .where(eq(organizations.id, auth.organizationId));

    if (!row) {
      return new Response(JSON.stringify({ error: "Organization not found" }), {
        status: 404,
      });
    }

    return new Response(
      JSON.stringify({
        settings: row.settings ?? {},
        features: row.features ?? {},
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error fetching organization settings:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch settings" }),
      { status: 500 },
    );
  }
};

export const PATCH: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

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
      .select({
        settings: organizations.settings,
        features: organizations.features,
      })
      .from(organizations)
      .where(eq(organizations.id, auth.organizationId));

    if (!current) {
      return new Response(JSON.stringify({ error: "Organization not found" }), {
        status: 404,
      });
    }

    const existingSettings = (current.settings ?? {}) as Record<
      string,
      unknown
    >;
    const settingsPatch = (parsed.data.settings ?? {}) as Record<
      string,
      unknown
    >;
    const mergedSettings: Record<string, unknown> = { ...existingSettings };

    for (const [key, value] of Object.entries(settingsPatch)) {
      if (value === null) {
        delete mergedSettings[key];
      } else if (value !== undefined) {
        mergedSettings[key] = value;
      }
    }

    const existingFeatures = (current.features ?? {}) as Record<
      string,
      unknown
    >;
    const featuresPatch = (parsed.data.features ?? {}) as Record<
      string,
      unknown
    >;
    const mergedFeatures: Record<string, unknown> = { ...existingFeatures };

    // Unlike settings keys, feature flags are plain booleans (not nullable
    // in the schema), so there is no null-to-delete path — just overwrite.
    for (const [key, value] of Object.entries(featuresPatch)) {
      if (value !== undefined) {
        mergedFeatures[key] = value;
      }
    }

    const [updated] = await getDb()
      .update(organizations)
      .set({
        settings: mergedSettings as any,
        features: mergedFeatures as any,
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, auth.organizationId))
      .returning({
        settings: organizations.settings,
        features: organizations.features,
      });

    // Clear the in-process domain-resolver cache so public pages on this
    // instance reflect the new settings immediately. In prod, other instances
    // may still serve the old value for up to 5 min (the resolver's TTL).
    clearDomainCache();

    return new Response(
      JSON.stringify({
        settings: updated.settings ?? {},
        features: updated.features ?? {},
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error updating organization settings:", error);
    return new Response(
      JSON.stringify({ error: "Failed to update settings" }),
      { status: 500 },
    );
  }
};
