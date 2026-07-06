# Phase C — Photo Geotagging (Evidence System)

## Goal

Turn every field photo into location-verified evidence by capturing GPS at upload time, computing geofence status immediately, and displaying it on both mobile and office review.

## Files Changed (Ordered)

### 1. Database — Migration 013

**File:** `apps/api/src/db/migrations/013_add-photo-geotagging.sql`

Add columns to `job_attachments`:

| Column | Type | Notes |
|--------|------|-------|
| `latitude` | `DOUBLE PRECISION` | GPS lat at capture time |
| `longitude` | `DOUBLE PRECISION` | GPS lng at capture time |
| `accuracy` | `DOUBLE PRECISION` | GPS accuracy in meters |
| `captured_at` | `TIMESTAMPTZ` | When the photo was taken (may differ from upload time) |
| `distance_from_site` | `INTEGER` | Meters — computed once at upload |
| `inside_geofence` | `BOOLEAN` | Computed once at upload |
| `width` | `INTEGER` | Cloudinary image width |
| `height` | `INTEGER` | Cloudinary image height |
| `format` | `VARCHAR(10)` | Cloudinary image format (jpg, png, webp) |

### 2. Shared Types

**File:** `packages/shared/src/types/index.ts`

Extend `JobAttachment` with all new fields. Also add `latitude`, `longitude`, `accuracy`, `captured_at` to `CreateJobAttachmentInput`.

### 3. Cloudinary Upload — Return dimensions

**File:** `apps/api/src/lib/cloudinary-storage.ts`

Extend return type of `uploadToCloudinary` to include `width`, `height`, `format`.

### 4. API Attachment Query — Accept GPS fields

**File:** `apps/api/src/db/queries/job-attachments.ts`

Update `create()` to accept and store the new GPS and dimension fields.

### 5. API Attachment Route — Accept GPS + compute geofence

**File:** `apps/api/src/routes/schedules/job-attachments.ts`

In POST handler:
1. Accept GPS query params: `lat`, `lng`, `accuracy`, `captured_at`
2. Before inserting, compute distance and geofence using project coords
3. Pass all GPS and dimension fields to `create()`

Also available as multipart fields for offline sync compatibility.

### 6. Frontend API Client — Pass GPS on upload

**File:** `apps/web/src/lib/api.ts`

Update `uploadJobAttachment()` to accept optional `lat`, `lng`, `accuracy`, `capturedAt` query params.

### 7. Mobile — Capture GPS during photo upload

**File:** `apps/web/src/components/mobile/JobDetailClient.tsx`

- Extract `getCurrentPosition()` into a shared utility (`@fieldconnect/shared` or inline in this file)
- In `handleFileUpload()`: call GPS capture before upload, pass to API
- In `handleFileUpload()` for offline mode: store GPS in the offline action payload

### 8. Mobile — Photo card shows GPS badge

**File:** `apps/web/src/components/mobile/JobDetailClient.tsx`

In `renderAttachmentCard()`, add a GPS info row below photos:

```
Before       09:15 AM
🟢 Inside Geofence  12 m
±5 m accuracy
```

Uses `calculateDistance()`, `evaluateGeofence()`, `formatDistance()` already in shared.

### 9. Office Review — Photo GPS badges

**File:** `apps/web/src/components/office/ReviewClient.tsx`

Update the attachment thumbnails section:
- Add GPS badge (inside/outside) to each photo
- Add distance, accuracy, capture time
- Add "View on Map" link using photo coordinates
- Show `⚪ GPS Unavailable` when no GPS data

### 10. Office Review — Checklist GPS quality

**File:** `apps/web/src/components/office/ReviewClient.tsx`

Enhance checklist items to show GPS status:
- `✓ Before Photo 🟢 GPS Verified` when inside
- `✓ Before Photo 🟠 Outside Geofence` when outside
- `✓ Before Photo ⚪ No GPS` when no data

### 11. Offline Queue — Carry GPS data

**File:** `apps/web/src/lib/offline-types.ts`

Extend `UploadPhotoAction` payload with `lat?`, `lng?`, `accuracy?`, `capturedAt?`.

**File:** `apps/web/src/hooks/useOfflineSync.ts`

- In `enqueuePhoto()`, accept optional GPS args and store
- In `syncAction()` upload_photo case, append GPS params

### 12. Docs

**Files:**
- `docs/implementation/CHANGELOG.md`
- `docs/implementation/ROADMAP.md`
- `docs/implementation/PROJECT_STATUS.md`

## Implementation Order

1. Migration 013
2. Shared types (JobAttachment + input)
3. Cloudinary (return dimensions)
4. Attachment queries (store new fields)
5. Attachment route (accept GPS, compute geofence)
6. Frontend API client (pass GPS params)
7. Mobile photo capture + display
8. Office review (badges + map)
9. Office checklist (GPS quality)
10. Offline queue support
11. Docs
