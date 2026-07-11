# File Upload Security — Implementation Plan

## Current State

Uploads flow: Client → `compressImage()` (1200px, 0.8q) → `POST /schedules/:id/attachments` → `request.file()` (Fastify multipart, 10MB limit, 1 file) → `uploadToCloudinary()` → DB insert

**Already in place:**
- Fastify multipart: 10 MB file size limit, 1 file limit
- Role-based access + ownership checks
- Max 20 attachments per job
- Client-side image compression

**Missing:**
- No server-side file type validation (trusts client-provided mimetype)
- No file extension whitelist
- No magic-byte inspection
- No filename sanitization
- No image dimension limits
- No SVG rejection
- No upload rate limiting
- No secure download headers
- No virus scanning hook

## Changes

### 1. Create `apps/api/src/lib/file-validation.ts` — File validation service

```typescript
// Allowed MIME types and their extensions
const ALLOWED_TYPES: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg', '.jfif'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/heic': ['.heic'],
  'image/heif': ['.heif'],
  'application/pdf': ['.pdf'],
};

// Magic bytes for content inspection (first few bytes of file)
const MAGIC_BYTES: Record<string, Uint8Array[]> = {
  'image/jpeg': [new Uint8Array([0xFF, 0xD8, 0xFF])],
  'image/png': [new Uint8Array([0x89, 0x50, 0x4E, 0x47])],
  'image/webp': [new Uint8Array([0x52, 0x49, 0x46, 0x46])], // RIFF header
  'image/heic': [new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70])],
  'image/heif': [new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70])],
  'application/pdf': [new Uint8Array([0x25, 0x50, 0x44, 0x46])],
};

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_IMAGE_DIMENSION = 4096; // pixels
const SANITIZE_FILENAME_REGEX = /[^a-zA-Z0-9._-]/g;

export interface ValidationResult {
  valid: boolean;
  error?: string;
  sanitizedFilename?: string;
}

export function validateFileType(mimeType: string, extension: string): ValidationResult
export function validateMagicBytes(buffer: Buffer, mimeType: string): ValidationResult
export function sanitizeFilename(filename: string): string
export function validateImageDimensions(width: number, height: number): ValidationResult
export function validateFileUpload(buffer: Buffer, mimeType: string, filename: string): ValidationResult
```

### 2. Update `apps/api/src/routes/schedules/job-attachments.ts`

Insert server-side validation after reading the file buffer:

1. Sanitize filename
2. Validate MIME type + extension match
3. Inspect magic bytes
4. Reject SVGs explicitly
5. Validate image dimensions (if type is image/* and Cloudinary returns them)

### 3. Add upload rate limiting to `apps/api/src/routes/schedules/job-attachments.ts`

- Per-user: max 30 uploads per 5 minutes
- Reuse the existing `rate_limit_events` table pattern (or a simpler in-memory tracker)
- Return 429 on exceed

### 4. Add secure download headers to `apps/api/src/index.ts`

When serving static files via `@fastify/static`:
- `Content-Disposition: attachment` (force download, not inline render)
- `X-Content-Type-Options: nosniff`

### 5. Migration 033: Add `file_validation` columns to `job_attachments`

- `content_verified_at TIMESTAMPTZ` — when we last verified the file content matches its type
- `virus_scan_status VARCHAR(20)` — 'pending' | 'clean' | 'infected' | 'skipped' for future AV hook

(Optional — can defer to a later migration)

## Files Modified

| File | Change |
|---|---|
| `apps/api/src/lib/file-validation.ts` | **New** — validation service |
| `apps/api/src/routes/schedules/job-attachments.ts` | Add validation + rate limiting in upload handler |
| `apps/api/src/index.ts` | Add secure download headers to static file serving |

## Files Unchanged

| File | Reason |
|---|---|
| `apps/api/src/lib/cloudinary-storage.ts` | Cloudinary handles its own security — we validate before sending |
| `apps/api/src/lib/file-storage.ts` | Local fallback — validation happens before this is called |
| `apps/web/src/components/mobile/JobDetailClient.tsx` | Client compression is additive; validation is server-side |
| `apps/web/src/lib/api.ts` | No API contract change — validation errors return 400 |
| `packages/shared/src/validation/index.ts` | `createJobAttachmentSchema` validates `attachment_type` only — no changes needed |

## Acceptance Criteria

1. Upload valid JPEG/PNG/WebP/PDF ✅ → accepted
2. Upload `.exe` renamed to `.jpg` with fake MIME type ❌ → rejected (magic byte mismatch)
3. Upload SVG ❌ → rejected explicitly
4. Upload filename with `../../etc/passwd` → sanitized to safe name
5. Upload >10MB ❌ → rejected (existing Fastify limit, confirmed)
6. Upload 30 files in quick succession → rate-limited on 31st within window
7. Download via `/uploads/` → `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`
8. `pnpm typecheck` ✅, `pnpm build` ✅
