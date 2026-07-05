# Phase D — Field Data Collection

## Summary

Add job notes (technician + internal), photo attachments (before/during/after/document), and signature capture to the job lifecycle. Server-side storage uses local filesystem. No offline sync, reporting, or advanced file storage.

## New Database Tables

### Migration 006: `job_notes`
```sql
CREATE TABLE job_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  content TEXT NOT NULL,
  note_type VARCHAR(20) NOT NULL DEFAULT 'technician'
    CHECK (note_type IN ('technician', 'internal')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_job_notes_schedule ON job_notes(schedule_id);
CREATE INDEX idx_job_notes_type ON job_notes(note_type);
```

### Migration 007: `job_attachments`
```sql
CREATE TABLE job_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  file_name VARCHAR(255) NOT NULL,
  original_name VARCHAR(255),
  file_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  file_size INTEGER NOT NULL,
  attachment_type VARCHAR(20) NOT NULL DEFAULT 'document'
    CHECK (attachment_type IN ('before', 'during', 'after', 'document')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ DEFAULT NULL
);
CREATE INDEX idx_job_attachments_schedule ON job_attachments(schedule_id);
CREATE INDEX idx_job_attachments_type ON job_attachments(attachment_type);
```

### Migration 008: `signatures`
```sql
CREATE TABLE signatures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  signature_data TEXT NOT NULL,
  label VARCHAR(100) DEFAULT 'customer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_signatures_schedule ON signatures(schedule_id);
```

**Decision**: Store signatures as raw base64 PNG in the database (TEXT column). Strip the `data:image/png;base64,` prefix before storing. Reconstruct the full data URL when returning via API. This keeps rows smaller, simplifies validation (pure base64 regex instead of prefix check), and allows adding a `mime_type` column later without data migration.

**Validation**: Zod schema validates the raw base64 string is valid base64 and max 524288 characters (512 KiB). The API handler strips the data URL prefix before storage and re-adds it on read.

## Shared Types (`packages/shared/src/types/index.ts`)

Add:
- `NoteType = 'technician' | 'internal'`
- `AttachmentType = 'before' | 'during' | 'after' | 'document'`
- `JobNote` interface
- `JobAttachment` interface  
- `Signature` interface
- `CreateJobNoteInput`, `CreateJobAttachmentInput`, `CreateSignatureInput`

## Zod Schemas (`packages/shared/src/validation/index.ts`)

Add:
- `createJobNoteSchema` — content (1-5000 chars), note_type (default 'technician')
- `createJobAttachmentSchema` — attachment_type enum
- `createSignatureSchema` — signature_data (min 1), label (optional, default 'customer')

## API Routes (`apps/api/src/routes/schedules/index.ts`)

Register new route plugins under `/api/v1/schedules/:id/`:

### Notes
| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/api/v1/schedules/:id/notes` | All authenticated | List notes for a job |
| POST | `/api/v1/schedules/:id/notes` | field_technician, admin | Add technician note |

### Attachments
| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/api/v1/schedules/:id/attachments` | All authenticated | List attachments for a job |
| POST | `/api/v1/schedules/:id/attachments` | field_technician, admin | Upload attachment (multipart) |
| DELETE | `/api/v1/schedules/:id/attachments/:attachmentId` | field_technician (own), admin | Delete attachment |

### Signatures
| Method | Path | Roles | Description |
|--------|------|-------|-------------|
| GET | `/api/v1/schedules/:id/signatures` | All authenticated | List signatures for a job |
| POST | `/api/v1/schedules/:id/signatures` | field_technician, admin | Capture signature |

### Notes on Role Protection
- Technicians: Can only add notes/attachments/signatures to their own jobs
- All authenticated users: Can read field data on any job
- Admin: Full access

## Query Files (`apps/api/src/db/queries/`)

### `job-notes.ts`
- `findBySchedule(scheduleId)` — return notes with user_name, ordered by created_at DESC
- `create(data)` — INSERT with schedule_id, user_id, content, note_type

### `job-attachments.ts`
- `findBySchedule(scheduleId)` — return non-deleted attachments with user_name (`WHERE deleted_at IS NULL`)
- `create(data)` — INSERT with file metadata
- `softDeleteById(id)` — SET `deleted_at = NOW()` + return the row so caller can remove file from disk; log who deleted it
- `findById(id)` — for ownership check before delete (include deleted records so admin can view audit trail)

### `signatures.ts`
- `findBySchedule(scheduleId)` — return signatures with user_name
- `create(data)` — INSERT with schedule_id, user_id, signature_data, label

## File Storage

Use `apps/api/uploads/` as the base upload directory. Serve files via a static route at `/uploads/:filename`. 

For multipart uploads, use `@fastify/multipart`. Store files with server-generated filenames:
```
uploads/{schedule_id}/{uuid}.{ext}
```

The original filename is preserved in the `original_name` column for display purposes. Server-side naming avoids path encoding issues and odd filenames.

**Dependencies to add**: `@fastify/multipart` and `@fastify/static` to `apps/api`.

## Frontend — Mobile Job Detail (`apps/web/src/components/mobile/JobDetailClient.tsx`)

### Sections to add (below Progress stepper, above action buttons):
1. **Technician Notes** — Text area to add notes, display existing notes with timestamp + user name
2. **Photos** — Grid showing attached images by type (Before/During/After). Camera capture via `<input type="file" accept="image/*" capture>` with client-side canvas resize to max 1200px before upload
   - **Server-side image verification**: validate actual image content (not just MIME type), allow only `image/jpeg`, `image/png`, `image/webp`
   - **Max upload size**: 10MB request limit; client-side compression targets ~1MB
3. **Signature** — Full-screen canvas capture with "Clear" and "Save" buttons. Display captured signatures below

### State additions:
- `notes: JobNote[]` — loaded on mount
- `attachments: JobAttachment[]` — loaded on mount
- `signatures: Signature[]` — loaded on mount
- `newNote: string` — text input for adding a note
- `saving: boolean` — loading state for all writes

### API calls to add to `apps/web/src/lib/api.ts`:
- `getJobNotes(scheduleId)`, `addJobNote(scheduleId, data)`
- `getJobAttachments(scheduleId)`, `uploadJobAttachment(scheduleId, formData)`, `deleteJobAttachment(scheduleId, attachmentId)`
- `getJobSignatures(scheduleId)`, `addJobSignature(scheduleId, data)`

## Role Authorization

| Action | field_technician | admin | office_manager | dispatcher |
|--------|:-:|:-:|:-:|:-:|
| Read notes/photos/signatures | ✅ | ✅ | ✅ | ✅ |
| Add technician notes | ✅ (own jobs) | ✅ | ❌ | ❌ |
| Add internal notes | ❌ | ✅ | ✅ | ✅ |
| Upload photos | ✅ (own jobs) | ✅ | ❌ | ❌ |
| Capture signature | ✅ (own jobs) | ✅ | ❌ | ❌ |
| Delete own attachment | ✅ | ✅ | ❌ | ❌ |

## File Sizes & Limits

- Image max 10MB before compression
- Client-side compression resizes to max 1200px on longest side (JPEG quality 0.8)
- Max 20 attachments per job

## Implementation Order

1. Migration files (006, 007, 008)
2. Shared types + Zod schemas
3. Query files (job-notes, job-attachments, signatures)
4. API route handlers (notes, attachments, signatures) + register in schedules routes
5. `@fastify/multipart` + file storage logic + serve static uploads
6. API client functions in `apps/web/src/lib/api.ts`
7. Canvas signature capture component
8. Update JobDetailClient with notes, photos, and signatures sections
9. Typecheck + build

## Files to Create/Modify

### New files:
- `apps/api/src/db/migrations/006_create-job-notes.sql`
- `apps/api/src/db/migrations/007_create-job-attachments.sql`
- `apps/api/src/db/migrations/008_create-signatures.sql`
- `apps/api/src/db/queries/job-notes.ts`
- `apps/api/src/db/queries/job-attachments.ts`
- `apps/api/src/db/queries/signatures.ts`
- `apps/web/src/components/mobile/SignatureCanvas.tsx`

### Modified files:
- `packages/shared/src/types/index.ts` — add new interfaces and types
- `packages/shared/src/validation/index.ts` — add new Zod schemas, export everything
- `apps/api/package.json` — add `@fastify/multipart` dependency
- `apps/api/src/db/queries/schedules.ts` — add field data joins to findById / findAll (include note/photo/signature counts)
- `apps/api/src/routes/schedules/index.ts` — register new field data routes
- `apps/api/src/index.ts` — add `@fastify/multipart` registration + static file serving
- `apps/web/src/lib/api.ts` — add field data API functions
- `apps/web/src/components/mobile/JobDetailClient.tsx` — add field data sections
