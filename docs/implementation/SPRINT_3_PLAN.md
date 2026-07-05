# Sprint 3 — Scheduling & Field Operations

**Goal:** A dispatcher can assign a job, a technician can complete it entirely from the mobile PWA (including notes, photos, and signature), and the office can watch progress in real time.

**Success criterion:** Full job lifecycle from office scheduling through technician completion, captured with audit trail.

> **Not in this sprint:** Reporting, analytics, CSV export, KPI widgets, timesheet reports, productivity dashboards. Those go in Sprint 4 — a contractor needs to finish jobs before they need reports.

---

## Architecture Decisions

- **Schedules** are day-level appointments linking a technician to a project on a specific date with time range and job status. A project can have multiple schedule entries (same tech on consecutive days, or multiple techs on the same day).
- **Job status** progression is enforced at the API layer (not DB CHECK) to allow future flexibility. Status transitions are wrapped in DB transactions with row-level locking and audit log writes.
- **Photo storage** uses local filesystem (Render Disk) with database metadata. Photos are compressed client-side before upload (Canvas API).
- **Signatures** are saved as PNG via Canvas API → server writes to disk, metadata in DB.
- **Audit logs** are insert-only — every status transition records user_id, previous_status, new_status, and timestamp.
- **Offline support** is a simple IndexedDB queue: cache assigned jobs, queue clock in/out, queue notes, queue photos, auto-sync when online. Not a full offline database — just enough to handle the common case of intermittent signal inside buildings, basements, and telecom rooms.
- **`job_attachments`** (not `attachments`) uses a `type` field with values `before`, `during`, `after`, `document` — extensible later for PDFs, permits, invoices, manuals.

---

## Phase A — Scheduling (Office)

### Deliverables

- Calendar view (day/week toggle)
- Drag-and-drop assignment
- Multiple technicians per project
- Unassigned jobs queue
- Reassignment (change tech, change date, change time)

### Database Migration: `003_create-schedules.sql`

```sql
CREATE TABLE schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  technician_id UUID NOT NULL REFERENCES users(id),
  scheduled_date DATE NOT NULL,
  start_time TIME,
  end_time TIME,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','traveling','on_site','completed','office_review','closed')),
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_schedules_date ON schedules(scheduled_date);
CREATE INDEX idx_schedules_technician ON schedules(technician_id);
CREATE INDEX idx_schedules_project ON schedules(project_id);
CREATE INDEX idx_schedules_status ON schedules(status);
```

### Backend Files

| File | Purpose |
|---|---|
| `apps/api/src/db/queries/schedules.ts` | SQL queries — findAll, findById, findByTechnician, findByDateRange, findUnassigned, create, update, updateStatus (with transaction + audit log) |
| `apps/api/src/routes/schedules/index.ts` | REST endpoints |

### API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/v1/schedules` | Any auth | List with filters (date, technician, project, status) |
| `GET` | `/api/v1/schedules/calendar?from=&to=` | Any auth | Calendar range |
| `GET` | `/api/v1/schedules/unassigned` | office/dispatch | Jobs without technician |
| `GET` | `/api/v1/schedules/my-jobs` | field_tech | Current tech's jobs |
| `GET` | `/api/v1/schedules/:id` | Any auth | Single schedule details |
| `POST` | `/api/v1/schedules` | office/dispatch | Create schedule entry |
| `PUT` | `/api/v1/schedules/:id` | office/dispatch | Update (reassign, reschedule) |
| `PATCH` | `/api/v1/schedules/:id/status` | role-dependent | Status transition |
| `DELETE` | `/api/v1/schedules/:id` | admin only | Delete schedule |

### Frontend Files

| File | Purpose |
|---|---|
| `apps/web/src/app/(office)/schedule/page.tsx` | Server page |
| `apps/web/src/app/(office)/schedule/ScheduleClient.tsx` | Main client component |
| `apps/web/src/components/office/CalendarView.tsx` | Day/week calendar grid |
| `apps/web/src/components/office/ScheduleForm.tsx` | Create/edit modal |
| `apps/web/src/components/office/UnassignedQueue.tsx` | Sidebar panel |
| `apps/web/src/components/office/ScheduleCard.tsx` | Draggable card |

### Key Behaviors

- **Day view:** hourly time slots, shows scheduled jobs as cards
- **Week view:** 7-day column layout
- **Cards show:** time range, project name, technician name, status badge (color-coded)
- **Drag-and-drop:** native HTML5 DnD — no external library. Drop an unassigned job onto a time slot to create. Drag an existing card to reassign or reschedule.
- **Fallback:** if DnD proves fragile, use select+button as backup

---

## Phase B — Technician Workflow (Mobile)

### Deliverables

- Today's Jobs tab
- Upcoming Jobs tab
- Completed Jobs tab
- Job details page
- Start Navigation button (opens maps)
- Contact Customer button (tel: link)

### Frontend Files

| File | Purpose |
|---|---|
| `apps/web/src/components/mobile/JobQueue.tsx` | Job list with Today/Upcoming/Completed tabs |
| `apps/web/src/components/mobile/JobCard.tsx` | Individual job card |
| `apps/web/src/app/(mobile)/jobs/[id]/page.tsx` | Job detail server page |
| `apps/web/src/components/mobile/JobDetailClient.tsx` | Job detail client component |
| `apps/web/src/app/(mobile)/mobile/page.tsx` | Modified: add job queue nav |

### Key Behaviors

- **Today's Jobs:** schedules for today, ordered by start_time. Shows project name, address, time range, status badge.
- **Start Navigation:** `maps://?daddr={address}` on iPhone, `geo:{lat},{lng}` fallback
- **Contact Customer:** `tel:{phone}` link
- **Status progress stepper:** visual indicator showing all 6 statuses with current one highlighted

---

## Phase C — Job Lifecycle (Status State Machine)

### Status Progression

```
Scheduled
↓
Traveling
↓
On Site
↓
Completed
↓
Office Review
↓
Closed
```

### Transition Rules

| From | To | Who |
|---|---|---|
| scheduled | traveling | field_technician (owns job) |
| traveling | on_site | field_technician (owns job) |
| on_site | completed | field_technician (owns job) |
| completed | office_review | admin, office_manager |
| office_review | closed | admin, office_manager |
| any | scheduled | admin, office_manager (reset/reassign) |

### Database Transaction (`updateStatus`)

```
1. BEGIN
2. SELECT current_status FROM schedules WHERE id = $1 FOR UPDATE  ← row lock
3. Validate transition is allowed (throw if invalid)
4. UPDATE schedules SET status = $2, updated_at = NOW() WHERE id = $1
5. INSERT INTO audit_logs (schedule_id, user_id, action, old_status, new_status)
6. COMMIT
```

### Audit Log Table: `004_create-audit-logs.sql`

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  old_status VARCHAR(20),
  new_status VARCHAR(20),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_schedule ON audit_logs(schedule_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);
```

### Every Transition Records

- timestamp
- user_id
- previous_status
- new_status

---

## Phase D — Field Data Collection

### D1 — Job Notes

**Table:** `005_create-job-notes.sql`

```sql
CREATE TABLE job_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id),
  note_type VARCHAR(20) NOT NULL CHECK (note_type IN ('technician','internal')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_notes_schedule ON job_notes(schedule_id);
```

**API:**
- `GET /api/v1/schedules/:scheduleId/notes` — List notes with author name
- `POST /api/v1/schedules/:scheduleId/notes` — Create note
  - field_technician → only 'technician' type
  - office → only 'internal' type
  - admin → either

**Frontend:** `apps/web/src/components/mobile/JobNotes.tsx`

**Backend files:**
- `apps/api/src/db/queries/job-notes.ts`
- `apps/api/src/routes/notes/index.ts`

---

### D2 — Photo Upload

**Table:** `006_create-job-attachments.sql`

```sql
CREATE TABLE job_attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES users(id),
  type VARCHAR(20) NOT NULL CHECK (type IN ('before','during','after','document')),
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(50) NOT NULL DEFAULT 'image/jpeg',
  file_size INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_job_attachments_schedule ON job_attachments(schedule_id);
CREATE INDEX idx_job_attachments_type ON job_attachments(type);
```

> **Note:** Named `job_attachments` (not `attachments`) for extensibility — the `type` field covers `before`, `during`, `after`, and `document`, making it easy to add PDFs, permits, invoices, and manuals later without schema changes.

**API:**
- `GET /api/v1/schedules/:scheduleId/attachments` — List
- `POST /api/v1/schedules/:scheduleId/attachments` — Upload (multipart, max 5MB, validates image/jpeg/png/webp)
- `GET /api/v1/attachments/:id/file` — Serve file
- `DELETE /api/v1/attachments/:id` — Delete (admin or own)

**Client-side compression:** Canvas API, max 1200px width, JPEG quality 0.7

**Storage:** `uploads/attachments/{scheduleId}/{uuid}.{ext}` (configurable via `UPLOAD_DIR` env var)

**Frontend:** `apps/web/src/components/mobile/PhotoUpload.tsx`

**Backend files:**
- `apps/api/src/db/queries/attachments.ts`
- `apps/api/src/routes/attachments/index.ts`

---

### D3 — Customer Signature

**Table:** `007_create-signatures.sql`

```sql
CREATE TABLE signatures (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  image_path VARCHAR(500) NOT NULL,
  customer_name VARCHAR(200),
  uploaded_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_signatures_schedule ON signatures(schedule_id);
```

**API:**
- `GET /api/v1/schedules/:scheduleId/signatures` — List
- `POST /api/v1/schedules/:scheduleId/signatures` — Capture
  - Receives `{ image_data: "data:image/png;base64,...", customer_name?: string }`
  - Saves PNG to `uploads/signatures/{scheduleId}/{uuid}.png`
- `GET /api/v1/signatures/:id/file` — Serve file

**Frontend:** `apps/web/src/components/mobile/SignaturePad.tsx` — HTML5 Canvas with clear/confirm, customer name input

**Backend files:**
- `apps/api/src/db/queries/signatures.ts`
- `apps/api/src/routes/signatures/index.ts`

---

## Phase E — Real-Time Updates (WebSocket)

### Events

| Event | Payload | Trigger |
|---|---|---|
| `job:update` | `{ type, schedule_id, project_name, technician_name, timestamp, metadata }` | Status transition, photo upload, signature capture |
| `job:assigned` | Same | New schedule created |

### Broadcast Targets

- `tech:status` room → all office staff (dashboard live feed)
- `user:{userId}` room → specific technician (personal notification)

### Files to Modify

| File | Changes |
|---|---|
| `apps/api/src/websocket/index.ts` | Add `broadcastJobEvent()`, register job event types |
| `apps/web/src/hooks/useSocket.ts` | Subscribe to `job:update` and `job:assigned` events |
| `apps/web/src/components/office/LiveStatusFeed.tsx` | Display job events alongside clock events |

---

## Phase F — Offline-First PWA Support

### Approach

Simple IndexedDB queue — not a full offline replica. Enough to survive the common scenario of intermittent signal inside buildings, basements, ceilings, telecom rooms, and electrical rooms.

### What Gets Cached

- Assigned jobs (schedule list for today/upcoming) — read from IndexedDB when offline
- Clock in/out actions — queued if offline, synced when online
- Notes — queued if offline, synced when online
- Photos — queued if offline, synced when online (compressed before queueing)

### What Does NOT Get Cached (deferred to later sprint)

- Full offline project database
- Offline time tracking with reconciliation
- Background sync via service worker
- Full IndexedDB schema replication

### Files to Create

| File | Purpose |
|---|---|
| `apps/web/src/lib/offline/db.ts` | IndexedDB wrapper — open DB, define stores |
| `apps/web/src/lib/offline/queue.ts` | Action queue — enqueue, dequeue, process, retry |
| `apps/web/src/lib/offline/sync.ts` | Sync manager — online/offline detection, flush queue |
| `apps/web/src/hooks/useOffline.ts` | Hook — provides `isOnline`, `queueAction`, `pendingCount` |

### Key Behaviors

- `navigator.onLine` + `online`/`offline` event listeners
- On app load: fetch jobs from API → cache in IndexedDB → render from cache
- On action (clock in, note, photo): attempt API call — if fails, queue to IndexedDB
- On `online` event: process queue FIFO, retry with exponential backoff
- Show sync status indicator in mobile UI (e.g., "2 pending uploads")
- Queue is persistent across page reloads (IndexedDB survives)

### Service Worker

Minimal PWA service worker update:
- Cache the app shell (HTML, JS, CSS) for offline page load
- Do NOT cache API responses in the service worker (managed by IndexedDB layer instead)

**File:** `apps/web/public/sw.js` (or update existing via next-pwa config)

---

## Phase G — Shared Types & Validation

### Files to Modify

| File | Changes |
|---|---|
| `packages/shared/src/types/index.ts` | Add all new types (see below) |
| `packages/shared/src/validation/index.ts` | Add all Zod schemas |

### New Types

```typescript
// ─── Job Status ──────────────────────────────────────────────────
export type JobStatus = 'scheduled' | 'traveling' | 'on_site' | 'completed' | 'office_review' | 'closed';
export const JOB_STATUSES: JobStatus[] = ['scheduled','traveling','on_site','completed','office_review','closed'];

// ─── Schedule ────────────────────────────────────────────────────
export interface Schedule { /* id, project_id, technician_id, scheduled_date, start_time, end_time, status, notes, created_by, created_at, updated_at */ }
export interface ScheduleWithDetails extends Schedule { project_name, project_address, technician_name }
export interface CreateScheduleInput { project_id, technician_id, scheduled_date, start_time?, end_time?, notes? }

// ─── Job Note ─────────────────────────────────────────────────────
export type NoteType = 'technician' | 'internal';
export interface JobNote { /* id, schedule_id, author_id, note_type, content, created_at */ }
export interface JobNoteWithAuthor extends JobNote { author_name }
export interface CreateJobNoteInput { schedule_id, note_type, content }

// ─── Job Attachment ───────────────────────────────────────────────
export type AttachmentType = 'before' | 'during' | 'after' | 'document';
export interface JobAttachment { /* id, schedule_id, uploaded_by, type, file_name, mime_type, file_size, created_at */ }

// ─── Signature ────────────────────────────────────────────────────
export interface Signature { /* id, schedule_id, image_path, customer_name, uploaded_by, created_at */ }
export interface CreateSignatureInput { schedule_id, image_data, customer_name? }

// ─── Audit Log ────────────────────────────────────────────────────
export interface AuditLog { /* id, schedule_id, user_id, action, old_status, new_status, metadata, created_at */ }

// ─── WebSocket Events ─────────────────────────────────────────────
export interface JobEvent {
  type: 'assignment' | 'travel_started' | 'arrived_onsite' | 'job_completed' | 'photo_uploaded' | 'signature_captured';
  schedule_id, project_name, technician_name, timestamp, metadata?
}

// ─── Dashboard (lightweight — just what the office needs to see) ──
export interface DashboardSummary {
  today_schedule_count: number;
  active_technician_count: number;
  completed_today_count: number;
  late_jobs_count: number;
  needs_review_count: number;
  today_schedules: ScheduleWithDetails[];
  active_technicians: { id: string; name: string; current_job: string | null }[];
}
```

---

## Phase H — Frontend API Client

### File to Modify

`apps/web/src/lib/api.ts` — Add all new API functions

New function groups:
- Schedule API (getSchedules, getCalendarSchedules, getMyJobs, getUnassignedJobs, getSchedule, createSchedule, updateSchedule, updateScheduleStatus, deleteSchedule)
- Job Notes API (getJobNotes, createJobNote)
- Attachments API (getAttachments, uploadAttachment, deleteAttachment)
- Signatures API (getSignatures, captureSignature)
- Dashboard API (getDashboardSummary) — lightweight, just what office needs to see progress

---

## Phase I — Route Registration + Navigation

### Register All New Routes in `apps/api/src/index.ts`

```typescript
import { scheduleRoutes } from './routes/schedules';
import { noteRoutes } from './routes/notes';
import { attachmentRoutes } from './routes/attachments';
import { signatureRoutes } from './routes/signatures';

await app.register(scheduleRoutes);
await app.register(noteRoutes);
await app.register(attachmentRoutes);
await app.register(signatureRoutes);
```

### Office Nav Updates (`apps/web/src/app/(office)/layout.tsx`)
- Add "Schedule" link → `/office/schedule`

### Mobile Nav Updates (`apps/web/src/app/(mobile)/layout.tsx`)
- Bottom nav: Home | Jobs | History
- Highlight active tab

---

## Implementation Order

| Order | Phase | Files |
|---|---|---|
| 1 | DB Migrations (schedules, audit_logs, job_notes, job_attachments, signatures) | 5 SQL files |
| 2 | Shared types & validation | 2 files modified |
| 3 | Schedules API (queries + routes) | 2 files created |
| 4 | Job Notes API (queries + routes) | 2 files created |
| 5 | Attachments API (queries + routes) | 2 files created |
| 6 | Signatures API (queries + routes) | 2 files created |
| 7 | Register routes + WebSocket events | 2 files modified |
| 8 | Frontend API client | 1 file modified |
| 9 | Office scheduling (calendar, drag-drop, forms) | 6 files created |
| 10 | Office nav updates | 1 file modified |
| 11 | Mobile job queue + job detail | 6 files created |
| 12 | Mobile nav updates | 1 file modified |
| 13 | WebSocket notification display | 2 files modified |
| 14 | Offline PWA (IndexedDB queue + sync) | 4 files created |
| 15 | Build + typecheck + docs | ROADMAP, CHANGELOG, CLAUDE.md |

---

## Files Summary

### New Files: ~33

| Count | Location |
|---|---|
| 5 | `apps/api/src/db/migrations/` |
| 5 | `apps/api/src/db/queries/` (schedules, job-notes, attachments, signatures) |
| 4 | `apps/api/src/routes/` (schedules, notes, attachments, signatures) |
| 11 | `apps/web/src/components/` (office + mobile) |
| 4 | `apps/web/src/app/` (office/schedule, mobile/jobs) |
| 4 | `apps/web/src/lib/offline/` + `hooks/` |
| — | `apps/web/public/sw.js` or next-pwa config |

### Modified Files: ~12

| Count | Location |
|---|---|
| 2 | `packages/shared/src/` |
| 1 | `apps/api/src/index.ts` |
| 1 | `apps/api/src/websocket/index.ts` |
| 1 | `apps/web/src/lib/api.ts` |
| 2 | `apps/web/src/hooks/` + existing components |
| 3 | `apps/web/src/app/(office)/layout`, `app/(mobile)/layout`, `app/(mobile)/mobile/page` |
| 2 | `docs/` |

---

## What's NOT in Sprint 3 (moved to Sprint 4)

- Dashboard analytics / KPI widgets
- Reporting (time reports, project reports)
- CSV export
- Timesheet reports
- Productivity reports
- Management dashboards

---

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| Drag-and-drop calendar is complex UI | Use native HTML5 DnD, no external dependency. Fall back to select+button. |
| Photo upload with no cloud storage | Use local filesystem (Render Disk). Easy to migrate to S3 later. |
| Client-side image compression quality | Canvas API at 0.7 quality, 1200px max width. |
| Status transitions must be atomic | DB transactions with row-level locking + audit log writes. |
| Offline queue complexity | Keep it simple — just queue actions + FIFO retry. No full offline DB. |
| Large sprint scope | Phases are additive and independently testable. |
