import type { APIRoute } from "astro";
import { generateSignedUploadParams, isStorageConfigured } from "@/lib/storage";

// GET - Generate signed upload parameters for Cloudinary
export const GET: APIRoute = async ({ locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!isStorageConfigured()) {
      return new Response(
        JSON.stringify({ error: "Storage service not configured" }),
        {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const params = generateSignedUploadParams();

    if (!params) {
      return new Response(
        JSON.stringify({ error: "Failed to generate upload parameters" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    return new Response(JSON.stringify(params), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error generating upload params:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
