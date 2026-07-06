import { v2 as cloudinary } from 'cloudinary';
import { randomUUID } from 'crypto';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const BASE_FOLDER = process.env.CLOUDINARY_FOLDER || 'fieldconnect';

/**
 * Upload a file buffer to Cloudinary.
 * Returns the public_id, secure_url, resource_type, and bytes.
 */
export async function uploadToCloudinary(
  scheduleId: string,
  buffer: Buffer,
  originalName: string,
  mimeType: string,
): Promise<{
  public_id: string;
  secure_url: string;
  resource_type: string;
  file_size: number;
}> {
  const publicId = randomUUID();
  const folder = `${BASE_FOLDER}/jobs/${scheduleId}`;

  // Convert buffer to a base64 data URI for Cloudinary upload
  const base64 = buffer.toString('base64');
  const dataUri = `data:${mimeType};base64,${base64}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    public_id: publicId,
    folder,
    resource_type: 'auto',
  });

  return {
    public_id: result.public_id,
    secure_url: result.secure_url,
    resource_type: result.resource_type,
    file_size: result.bytes,
  };
}

/**
 * Upload a signature base64 data URL to Cloudinary as a PNG image.
 */
export async function uploadSignatureToCloudinary(
  scheduleId: string,
  signatureDataUrl: string,
): Promise<{
  public_id: string;
  secure_url: string;
}> {
  const publicId = randomUUID();
  const folder = `${BASE_FOLDER}/signatures/${scheduleId}`;

  const result = await cloudinary.uploader.upload(signatureDataUrl, {
    public_id: publicId,
    folder,
    resource_type: 'image',
    format: 'png',
  });

  return {
    public_id: result.public_id,
    secure_url: result.secure_url,
  };
}

/**
 * Delete a file from Cloudinary by its public_id.
 */
export async function deleteFromCloudinary(publicId: string): Promise<void> {
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch {
    // Ignore errors — file may not exist
  }
}
