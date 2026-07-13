import { v2 as cloudinary, ConfigOptions } from 'cloudinary';
import { randomUUID } from 'crypto';
import {
  mockUpload,
  mockSignatureUpload,
  mockDelete,
} from './storage-mock';

const BASE_FOLDER = process.env.CLOUDINARY_FOLDER || 'fieldconnect';
const USE_MOCK = process.env.CLOUDINARY_PROVIDER === 'mock';

// In mock mode, we don't need to configure cloudinary at all and we
// never touch the network. The boot-time require() of the cloudinary
// package still happens (because the import is at the top of this file),
// but no API calls are made.
//
// If you want to fully avoid the cloudinary import in mock mode, set
// CLOUDINARY_PROVIDER=mock in the test env. The import itself is harmless
// (no side effects), but it does add ~5MB to the test bundle.

if (!USE_MOCK) {
  const config: ConfigOptions = {
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  };
  cloudinary.config(config);
}

/**
 * Whether the storage layer is running against the mock provider.
 * Routes can use this to skip network-touching side effects in tests.
 */
export function isMockStorage(): boolean {
  return USE_MOCK;
}

/**
 * Upload a file buffer to Cloudinary.
 * Returns the public_id, secure_url, resource_type, and bytes.
 *
 * When CLOUDINARY_PROVIDER=mock, returns a deterministic placeholder URL
 * without making any network call.
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
  width: number;
  height: number;
  format: string;
}> {
  if (USE_MOCK) {
    return mockUpload(scheduleId, buffer, originalName, mimeType, BASE_FOLDER);
  }

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
    width: result.width,
    height: result.height,
    format: result.format,
  };
}

/**
 * Upload a signature base64 data URL to Cloudinary as a PNG image.
 *
 * When CLOUDINARY_PROVIDER=mock, returns a placeholder URL.
 */
export async function uploadSignatureToCloudinary(
  scheduleId: string,
  _signatureDataUrl: string,
): Promise<{
  public_id: string;
  secure_url: string;
}> {
  if (USE_MOCK) {
    return mockSignatureUpload(scheduleId, BASE_FOLDER);
  }

  const publicId = randomUUID();
  const folder = `${BASE_FOLDER}/signatures/${scheduleId}`;

  const result = await cloudinary.uploader.upload(_signatureDataUrl, {
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
 *
 * When CLOUDINARY_PROVIDER=mock, this is a no-op.
 */
export async function deleteFromCloudinary(publicId: string): Promise<void> {
  if (USE_MOCK) {
    return mockDelete(publicId);
  }
  try {
    await cloudinary.uploader.destroy(publicId);
  } catch {
    // Ignore errors — file may not exist
  }
}
