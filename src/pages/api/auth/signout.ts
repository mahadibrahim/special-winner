import type { APIRoute } from "astro";
import { invalidateSession } from "@/lib/auth";

// Support both GET (browser navigation) and POST (form submission)
export const GET: APIRoute = async (context) => {
  try {
    await invalidateSession(context);
    return context.redirect("/");
  } catch (error) {
    console.error("Signout error:", error);
    return context.redirect("/");
  }
};

export const POST: APIRoute = async (context) => {
  try {
    await invalidateSession(context);

    // Check if request accepts JSON or is a form submission
    const acceptHeader = context.request.headers.get("accept") || "";
    const isFormSubmission = !acceptHeader.includes("application/json");

    if (isFormSubmission) {
      // Redirect to home page for form submissions
      return context.redirect("/");
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200 }
    );
  } catch (error) {
    console.error("Signout error:", error);
    return new Response(
      JSON.stringify({ error: "An unexpected error occurred" }),
      { status: 500 }
    );
  }
};
