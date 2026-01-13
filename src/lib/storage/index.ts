import { v2 as cloudinary } from "cloudinary";

// Initialize Cloudinary
const cloudName = import.meta.env.CLOUDINARY_CLOUD_NAME;
const apiKey = import.meta.env.CLOUDINARY_API_KEY;
const apiSecret = import.meta.env.CLOUDINARY_API_SECRET;

if (cloudName && apiKey && apiSecret) {
  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });
}

export function isStorageConfigured(): boolean {
  return !!(cloudName && apiKey && apiSecret);
}

export { cloudinary };

// Upload options for profile photos
export const PHOTO_UPLOAD_OPTIONS = {
  folder: "family-photos",
  transformation: [
    { width: 400, height: 400, crop: "fill", gravity: "face" },
    { quality: "auto", fetch_format: "auto" },
  ],
  allowed_formats: ["jpg", "jpeg", "png", "webp"],
  max_file_size: 5000000, // 5MB
};

// Generate signed upload parameters for direct browser upload
export function generateSignedUploadParams(): {
  timestamp: number;
  signature: string;
  apiKey: string;
  cloudName: string;
  folder: string;
} | null {
  if (!isStorageConfigured()) {
    return null;
  }

  const timestamp = Math.round(Date.now() / 1000);
  const folder = PHOTO_UPLOAD_OPTIONS.folder;

  // Generate signature for upload
  const signature = cloudinary.utils.api_sign_request(
    {
      timestamp,
      folder,
    },
    apiSecret!
  );

  return {
    timestamp,
    signature,
    apiKey: apiKey!,
    cloudName: cloudName!,
    folder,
  };
}

// Delete an image by public ID
export async function deleteImage(publicId: string): Promise<boolean> {
  if (!isStorageConfigured()) {
    console.warn("Storage not configured - cannot delete image");
    return false;
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId);
    return result.result === "ok";
  } catch (error) {
    console.error("Error deleting image:", error);
    return false;
  }
}

// Extract public ID from Cloudinary URL
export function extractPublicId(url: string): string | null {
  try {
    // URL format: https://res.cloudinary.com/cloud_name/image/upload/v123/folder/filename.ext
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.\w+)?$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
