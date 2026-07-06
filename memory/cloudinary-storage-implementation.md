---
name: cloudinary-storage-implementation
description: Cloudinary replaces local filesystem for all production uploads (photos, documents, signatures)
metadata:
  type: project
---

Cloudinary is now the primary storage backend for all file uploads in FieldConnect. The implementation follows a **Cloudinary-first, local-fallback** pattern:

- **New uploads** go to Cloudinary under `fieldconnect/jobs/{schedule_id}` (attachments) or `fieldconnect/signatures/{schedule_id}` (signatures)
- **If Cloudinary fails**, the system falls back to local disk storage (graceful degradation)
- **Existing records** with local `file_path` continue to work via the old `/uploads/` static file serving
- **Frontend** checks `secure_url` first, then falls back to the local URL

### Files created:
- `apps/api/src/lib/cloudinary-storage.ts` — Cloudinary SDK wrapper (upload, uploadSignature, delete)
- `apps/api/src/db/migrations/010_add-cloudinary.sql` — adds `cloudinary_public_id`, `secure_url`, `resource_type` columns

### Files modified:
- `.env` — added `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLOUDINARY_FOLDER`
- `apps/api/package.json` — added `cloudinary` dependency
- `packages/shared/src/types/index.ts` — added optional cloudinary fields to `JobAttachment` and `Signature`
- `apps/api/src/db/queries/job-attachments.ts` — `create()` accepts cloudinary fields
- `apps/api/src/db/queries/signatures.ts` — `create()` accepts cloudinary fields
- `apps/api/src/routes/schedules/job-attachments.ts` — uploads to Cloudinary, cleans up on error
- `apps/api/src/routes/schedules/signatures.ts` — uploads base64 to Cloudinary as PNG
- `apps/web/src/components/mobile/JobDetailClient.tsx` — uses `secure_url` with fallback
- `apps/web/src/components/office/ReviewClient.tsx` — uses `secure_url` with fallback

**Why:** Local Render storage causes images to break (ephemeral filesystem, no persistence across deploys). Cloudinary provides persistent, CDN-backed URLs that work on Vercel + Render.

**How to apply:** Set Cloudinary env vars in production before deploying. Run migration `pnpm db:migrate`. Cloudinary credentials can be left empty in dev — the local fallback handles it.
