import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Default notification preferences
const defaultPreferences = {
  emailRegistrationConfirmation: true,
  emailPaymentReceipts: true,
  emailScheduleReminders: true,
  emailAnnouncements: true,
  emailWeeklyDigest: false,
};

// GET - Get notification preferences
export const GET: APIRoute = async ({ locals }) => {
  const user = locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // For now, we store preferences in localStorage on the client side
    // In the future, this could be stored in a user_preferences table
    return new Response(
      JSON.stringify({ preferences: defaultPreferences }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error fetching notification preferences:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

// PUT - Update notification preferences
export const PUT: APIRoute = async ({ request, locals }) => {
  const user = locals.user;
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await request.json();

    // Validate the preferences
    const preferences = {
      emailRegistrationConfirmation: Boolean(body.emailRegistrationConfirmation ?? true),
      emailPaymentReceipts: Boolean(body.emailPaymentReceipts ?? true),
      emailScheduleReminders: Boolean(body.emailScheduleReminders ?? true),
      emailAnnouncements: Boolean(body.emailAnnouncements ?? true),
      emailWeeklyDigest: Boolean(body.emailWeeklyDigest ?? false),
    };

    // For now, just acknowledge the save - in production, store in database
    // Future enhancement: Add notificationPreferences JSONB column to users table

    return new Response(
      JSON.stringify({
        success: true,
        preferences,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error updating notification preferences:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
