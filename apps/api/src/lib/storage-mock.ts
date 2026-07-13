/**
 * Mock Cloudinary provider.
 *
 * Returns deterministic placeholder URLs without making any network call.
 * This is a CLOUDINARY_PROVIDER=mock implementation that swaps in for
 * the real Cloudinary SDK when running tests, RC, or local dev.
 *
 * Why "mock" instead of "bypass":
 *   - Bypass flags tend to spread. A single boolean check becomes a maze
 *     of `if (bypass) ... else cloudinary.upload(...)` calls.
 *   - A provider abstraction means callers don't change. Same function
 *     signature, same return shape, no behavior drift.
 *   - Future storage backends (S3, R2, local disk) plug in the same way.
 *
 * Set CLOUDINARY_PROVIDER=mock to enable. The boot-time check in
 * cloudinary-storage.ts selects this module instead of the real SDK.
 *
 * The placeholder URL format is stable enough for tests to assert on:
 *   https://mock-cloudinary.fieldconnect.test/{folder}/{publicId}.{format}
 */

import { randomUUID } from 'crypto';

const MOCK_HOST = 'https://mock-cloudinary.fieldconnect.test';

export interface UploadResult {
  public_id: string;
  secure_url: string;
  resource_type: string;
  file_size: number;
  width: number;
  height: number;
  format: string;
}

export interface SignatureUploadResult {
  public_id: string;
  secure_url: string;
}

/**
 * Mock upload for generic files (photos, documents).
 * Returns a deterministic placeholder URL.
 */
export async function mockUpload(
  scheduleId: string,
  buffer: Buffer,
  originalName: string,
  mimeType: string,
  baseFolder: string = 'fieldconnect',
): Promise<UploadResult> {
  const publicId = randomUUID();
  const folder = `${baseFolder}/jobs/${scheduleId}`;
  const ext = originalName.split('.').pop() || 'bin';
  const format = mimeType.startsWith('image/') ? ext : ext;

  return {
    public_id: publicId,
    secure_url: `${MOCK_HOST}/${folder}/${publicId}.${format}`,
    resource_type: mimeType.startsWith('image/') ? 'image' : 'raw',
    file_size: buffer.length,
    width: 1024,
    height: 768,
    format,
  };
}

/**
 * Mock upload for signatures. Always returns PNG.
 *
 * Note: the signature param is intentionally unused — the mock returns a
 * deterministic placeholder regardless of input. The parameter is kept
 * to match the real Cloudinary signature upload function signature.
 */
export async function mockSignatureUpload(
  scheduleId: string,
  _signatureDataUrl?: string,
  baseFolder: string = 'fieldconnect',
): Promise<SignatureUploadResult> {
  const publicId = randomUUID();
  const folder = `${baseFolder}/signatures/${scheduleId}`;
  return {
    public_id: publicId,
    secure_url: `${MOCK_HOST}/${folder}/${publicId}.png`,
  };
}

/**
 * Mock delete. No-op.
 */
export async function mockDelete(_publicId: string): Promise<void> {
  // Intentional no-op — there's nothing to delete from a mock.
}

/**
 * Provider selection. Returns the real or mock implementation based on
 * CLOUDINARY_PROVIDER. The real implementation is dynamically imported
 * so tests don't need cloudinary installed.
 */
export async function getStorageProvider(): Promise<{
  upload: (scheduleId: string, buffer: Buffer, name: string, mime: string) => Promise<UploadResult>;
  uploadSignature: (scheduleId: string, signatureDataUrl: string) => Promise<SignatureUploadResult>;
  remove: (publicId: string) => Promise<void>;
  isMock: boolean;
}> {
  const provider = process.env.CLOUDINARY_PROVIDER || 'cloudinary';

  if (provider === 'mock') {
    return {
      upload: mockUpload as any,
      uploadSignature: mockSignatureUpload as any,
      remove: mockDelete,
      isMock: true,
    };
  }

  // Real Cloudinary — import the real module lazily
  const real = await import('./cloudinary-storage');
  return {
    upload: real.uploadToCloudinary,
    uploadSignature: real.uploadSignatureToCloudinary,
    remove: real.deleteFromCloudinary,
    isMock: false,
  };
}
