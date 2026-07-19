import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { validateSession } from "@/lib/auth";
import { recordPhoneOptIn } from "@/lib/sms/opt-in";

const profileSchema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  phone: z.string().max(20).optional().nullable(),
  // Optional: only set the first time the user completes their profile.
  // Required for adult-self registrations — the registration wizard
  // surfaces an inline "complete your profile" form when this is missing
  // so the customer doesn't get silently routed to the dependent-add flow.
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)")
    .optional()
    .nullable(),
  // Gender is always optional. "" is treated as absent (it's the unset
  // placeholder value of the wizard's profile-completion select) rather than
  // failing the enum with a raw zod error.
  gender: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z
      .enum(["male", "female", "other", "prefer_not_to_say"], {
        message: "Pick a gender from the list, or leave it blank",
      })
      .optional()
      .nullable(),
  ),
  // Sent only by forms that collect a phone next to the SmsConsentCheckbox
  // (e.g. the wizard's complete-your-profile step). When present, records
  // phone opt-in state for the resolved organization; when absent, opt-in
  // state is untouched.
  smsConsent: z.boolean().optional(),
});

// GET - Get current user profile
export const GET: APIRoute = async (context) => {
  const { user } = await validateSession(context);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const [profile] = await getDb()
      .select({
        id: users.id,
        email: users.email,
        emailVerified: users.emailVerified,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        avatarUrl: users.avatarUrl,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!profile) {
      return new Response(JSON.stringify({ error: "User not found" }), { status: 404 });
    }

    return new Response(JSON.stringify({ profile }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error fetching profile:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch profile" }), { status: 500 });
  }
};

// PUT - Update user profile
export const PUT: APIRoute = async (context) => {
  const { user } = await validateSession(context);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  try {
    const body = await context.request.json();
    const result = profileSchema.safeParse(body);

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: "Validation failed", details: result.error.flatten().fieldErrors }),
        { status: 400 }
      );
    }

    const updates: Record<string, unknown> = {
      firstName: result.data.firstName,
      lastName: result.data.lastName,
      phone: result.data.phone,
      updatedAt: new Date(),
    };
    // Only set birthDate/gender when the caller actually included them —
    // a PUT that omits these should not blank existing values.
    if (result.data.birthDate !== undefined) {
      updates.birthDate = result.data.birthDate;
    }
    if (result.data.gender !== undefined) {
      updates.gender = result.data.gender;
    }

    const [updatedProfile] = await getDb()
      .update(users)
      .set(updates)
      .where(eq(users.id, user.id))
      .returning({
        id: users.id,
        email: users.email,
        emailVerified: users.emailVerified,
        firstName: users.firstName,
        lastName: users.lastName,
        phone: users.phone,
        birthDate: users.birthDate,
        gender: users.gender,
        avatarUrl: users.avatarUrl,
      });

    // Record SMS opt-in state when the form collected a phone alongside the
    // consent checkbox. Best-effort — a failure must not fail the profile save.
    const organization = (
      context.locals as unknown as { organization?: { id: string } | null }
    ).organization;
    if (
      result.data.smsConsent !== undefined &&
      result.data.phone &&
      organization?.id
    ) {
      try {
        await recordPhoneOptIn({
          organizationId: organization.id,
          userId: user.id,
          phone: result.data.phone,
          consented: result.data.smsConsent,
          source: "registration_form",
        });
      } catch (err) {
        console.error("Failed to record phone opt-in:", err);
      }
    }

    return new Response(JSON.stringify({ profile: updatedProfile }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error updating profile:", error);
    return new Response(JSON.stringify({ error: "Failed to update profile" }), { status: 500 });
  }
};
