import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { familyMembers } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { deleteImage, extractPublicId, isStorageConfigured } from "@/lib/storage";

const updatePhotoSchema = z.object({
  photoUrl: z.string().url("Invalid photo URL"),
});

// POST - Save photo URL after Cloudinary upload
export const POST: APIRoute = async ({ params, request, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { id } = params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Family member ID required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb();

    // Verify ownership
    const [member] = await getDb()
      .select()
      .from(familyMembers)
      .where(and(eq(familyMembers.id, id), eq(familyMembers.parentUserId, user.id)));

    if (!member) {
      return new Response(JSON.stringify({ error: "Family member not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Parse and validate request body
    const body = await request.json();
    const validation = updatePhotoSchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({
          error: "Validation failed",
          details: validation.error.flatten().fieldErrors,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const { photoUrl } = validation.data;

    // Delete old photo if exists
    if (member.photoUrl && isStorageConfigured()) {
      const oldPublicId = extractPublicId(member.photoUrl);
      if (oldPublicId) {
        deleteImage(oldPublicId).catch((err) =>
          console.error("Error deleting old photo:", err)
        );
      }
    }

    // Update family member with new photo URL
    const [updated] = await getDb()
      .update(familyMembers)
      .set({
        photoUrl,
        updatedAt: new Date(),
      })
      .where(eq(familyMembers.id, id))
      .returning();

    return new Response(JSON.stringify({ familyMember: updated }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error updating photo:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

// DELETE - Remove photo from family member
export const DELETE: APIRoute = async ({ params, locals }) => {
  try {
    const user = locals.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { id } = params;
    if (!id) {
      return new Response(JSON.stringify({ error: "Family member ID required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb();

    // Verify ownership
    const [member] = await getDb()
      .select()
      .from(familyMembers)
      .where(and(eq(familyMembers.id, id), eq(familyMembers.parentUserId, user.id)));

    if (!member) {
      return new Response(JSON.stringify({ error: "Family member not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Delete photo from storage if exists
    if (member.photoUrl && isStorageConfigured()) {
      const publicId = extractPublicId(member.photoUrl);
      if (publicId) {
        await deleteImage(publicId);
      }
    }

    // Update family member to remove photo URL
    const [updated] = await getDb()
      .update(familyMembers)
      .set({
        photoUrl: null,
        updatedAt: new Date(),
      })
      .where(eq(familyMembers.id, id))
      .returning();

    return new Response(JSON.stringify({ familyMember: updated }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error removing photo:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
