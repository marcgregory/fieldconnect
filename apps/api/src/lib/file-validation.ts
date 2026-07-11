import { extname } from 'path';

// ─── Configuration ───────────────────────────────────────────────────────────

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB (mirrors the Fastify multipart limit)
const MAX_IMAGE_DIMENSION = 4096; // px — reject unreasonably large images
const MAX_UPLOADS_PER_WINDOW = 30; // per-user
const UPLOAD_WINDOW_MS = 5 * 60 * 1000; // 5 minutes

// Allowed MIME types mapped to their valid file extensions.
// Technicians primarily upload photos and PDF documents.
const ALLOWED_TYPES: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg', '.jfif'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/heic': ['.heic'],
  'image/heif': ['.heif'],
  'application/pdf': ['.pdf'],
};

// Magic bytes for content-type verification.
// Check the first few bytes of the file to confirm it matches the declared MIME type.
const MAGIC_BYTES: Record<string, Uint8Array[]> = {
  'image/jpeg': [new Uint8Array([0xFF, 0xD8, 0xFF])],
  'image/png': [new Uint8Array([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])],
  'image/webp': [new Uint8Array([0x52, 0x49, 0x46, 0x46])], // RIFF header
  'image/heic': [new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63])], // ftyp heic
  'image/heif': [new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63])], // ftyp heic (same start)
  'application/pdf': [new Uint8Array([0x25, 0x50, 0x44, 0x46])], // %PDF
};

const REJECTED_MIME_TYPES = [
  'image/svg+xml',    // SVG — prevents XSS via inline scripts
  'text/html',        // HTML — prevents CSRF/phishing payloads
  'application/xml',  // XML — prevents XXE attacks
];

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitizedFilename?: string;
}

// ─── Upload rate limiting (in-memory) ────────────────────────────────────────

/** Simple sliding-window counter keyed by user ID. */
const uploadCounts = new Map<string, { count: number; windowStart: number }>();

/**
 * Check whether a user has exceeded the upload rate limit.
 * Returns seconds until the user can upload again, or 0 if allowed.
 */
export function checkUploadRateLimit(userId: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const entry = uploadCounts.get(userId);

  if (!entry || now - entry.windowStart > UPLOAD_WINDOW_MS) {
    // Start a new window
    uploadCounts.set(userId, { count: 1, windowStart: now });
    return { allowed: true, retryAfter: 0 };
  }

  entry.count += 1;

  if (entry.count > MAX_UPLOADS_PER_WINDOW) {
    const retryAfter = Math.ceil((UPLOAD_WINDOW_MS - (now - entry.windowStart)) / 1000);
    return { allowed: false, retryAfter };
  }

  return { allowed: true, retryAfter: 0 };
}

/**
 * Reset the upload count for a user (used in tests).
 */
export function resetUploadRateLimit(userId: string): void {
  uploadCounts.delete(userId);
}

// ─── File type validation ────────────────────────────────────────────────────

/**
 * Check that the declared MIME type and file extension are in the allowlist
 * and match each other.
 */
export function validateFileType(mimeType: string, extension: string): ValidationResult {
  const lowerMime = mimeType.toLowerCase();
  const lowerExt = extension.toLowerCase();

  // Reject explicitly dangerous types
  if (REJECTED_MIME_TYPES.includes(lowerMime)) {
    return { valid: false, error: `File type '${mimeType}' is not allowed` };
  }

  // Check MIME type is allowed
  const validExtensions = ALLOWED_TYPES[lowerMime];
  if (!validExtensions) {
    return { valid: false, error: `File type '${mimeType}' is not supported` };
  }

  // Check extension is valid for this MIME type
  if (!validExtensions.includes(lowerExt)) {
    return {
      valid: false,
      error: `Extension '${extension}' does not match file type '${mimeType}'`,
    };
  }

  return { valid: true };
}

/**
 * Verify file content by inspecting magic bytes.
 * Reads the first N bytes of the buffer and compares against known signatures.
 */
export function validateMagicBytes(buffer: Buffer, mimeType: string): ValidationResult {
  const lowerMime = mimeType.toLowerCase();
  const signatures = MAGIC_BYTES[lowerMime];

  if (!signatures) {
    // No magic-byte check defined — allow through (PDF and images all have signatures)
    return { valid: true };
  }

  const matches = signatures.some((sig) => {
    if (buffer.length < sig.length) return false;
    return sig.every((byte, i) => buffer[i] === byte);
  });

  if (!matches) {
    return {
      valid: false,
      error: 'File content does not match the declared file type',
    };
  }

  return { valid: true };
}

/**
 * Sanitize a filename to prevent path traversal and special character injection.
 * - Removes directory separators
 * - Replaces non-alphanumeric characters (except dots, underscores, hyphens)
 * - Ensures the filename is not empty after sanitization
 */
export function sanitizeFilename(filename: string): string {
  // Remove any leading directory path
  let safe = filename.replace(/^.*[/\\]/, '');

  // Replace unsafe characters
  safe = safe.replace(/[^a-zA-Z0-9._\-]/g, '_');

  // Prevent empty or dot-only names
  if (!safe || safe === '.' || safe === '..') {
    safe = `upload_${Date.now()}`;
  }

  // Truncate overly long filenames (max 200 chars including extension)
  if (safe.length > 200) {
    const ext = extname(safe);
    const base = safe.slice(0, 200 - ext.length);
    safe = base + ext;
  }

  return safe;
}

/**
 * Get a safe file extension from the filename, lowercased.
 */
export function getSafeExtension(filename: string): string {
  return extname(filename).toLowerCase();
}

/**
 * Validate image dimensions against the configured maximum.
 */
export function validateImageDimensions(
  width: number | null | undefined,
  height: number | null | undefined,
): ValidationResult {
  if (width == null || height == null) return { valid: true }; // non-image or unknown

  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    return {
      valid: false,
      error: `Image dimensions (${width}x${height}) exceed the maximum of ${MAX_IMAGE_DIMENSION}px`,
    };
  }

  return { valid: true };
}

/**
 * Run all file validations. This is the main entry point for the upload handler.
 */
export function validateFileUpload(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): ValidationResult {
  // 1. Sanitize filename
  const sanitized = sanitizeFilename(filename);
  const extension = getSafeExtension(filename);

  // 2. Validate MIME type + extension
  const typeResult = validateFileType(mimeType, extension);
  if (!typeResult.valid) {
    return { ...typeResult, sanitizedFilename: sanitized };
  }

  // 3. Validate magic bytes
  const magicResult = validateMagicBytes(buffer, mimeType);
  if (!magicResult.valid) {
    return { ...magicResult, sanitizedFilename: sanitized };
  }

  return { valid: true, sanitizedFilename: sanitized };
}
