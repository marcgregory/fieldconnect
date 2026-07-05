# Sprint 3 — Scheduling, Job Workflow & Field Operations

**Goal:** Complete the daily workflow from office scheduling to technician job completion.

---

## Overview

This sprint adds ~20 new files across 4 packages. All changes are backward-compatible with Sprint 2 data. The existing project–technician assignment model is extended with daily scheduling, a job-status state machine, notes, photos, signatures, and audit logging.

### Architecture Decisions

- **Schedules** are day-level appointments linking a technician to a project on a specific date with time range and job status. A project can have multiple schedule entries (same tech on consecutive days, or multiple techs on the same day).
- **Job status** is a simple string enum on `schedules`. The progression is enforced at the API layer (not DB CHECK) to allow future flexibility.
- **Photo storage** uses local filesystem (Render Disk) with database metadata. Photos are compressed client-side before upload (Canvas API).
- **Signatures** are saved as PNG data URIs → server writes to disk, metadata in DB.
- **Audit logs** record every status transition. Insert-only, no updates.

---

## Phase 1 — Database Migrations (5 new migrations)

### Files to create

| File | Purpose |
|---|---|
| `apps/api/src/db/migrations/003_create-schedules.sql` | schedules table with job status enum |
| `apps/api/src/db/migrations/004_create-job-notes.sql` | job_notes table (technician + internal) |
| `apps/api/src/db/migrations/005_create-attachments.sql` | attachments table for photos |
| `apps/api/src/db/migrations/006_create-signatures.sql` | signatures table |
| `apps/api/src/db/migrations/007_create-audit-logs.sql` | audit_logs table (insert-only) |

### 003_create-schedules.sql

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

### 004_create-job-notes.sql

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

### 005_create-attachments.sql

```sql
CREATE TABLE attachments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(50) NOT NULL DEFAULT 'image/jpeg',
  file_size INT,
  category VARCHAR(20) NOT NULL CHECK (category IN ('before','during','after')),
  uploaded_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_attachments_schedule ON attachments(schedule_id);
CREATE INDEX idx_attachments_category ON attachments(category);
```

### 006_create-signatures.sql

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

### 007_create-audit-logs.sql

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

---

## Phase 2 — Shared Types & Validation

### Files to modify

| File | Changes |
|---|---|
| `packages/shared/src/types/index.ts` | Add Schedule, JobNote, Attachment, Signature, AuditLog types + enums |
| `packages/shared/src/validation/index.ts` | Add Zod schemas for all new entities |

### Types to add (`types/index.ts`)

```typescript
// ─── Job Status ──────────────────────────────────────────────────
export type JobStatus = 'scheduled' | 'traveling' | 'on_site' | 'completed' | 'office_review' | 'closed';
export const JOB_STATUSES: JobStatus[] = ['scheduled','traveling','on_site','completed','office_review','closed'];

// ─── Schedule ────────────────────────────────────────────────────
export interface Schedule {
  id: string;
  project_id: string;
  technician_id: string;
  scheduled_date: string;
  start_time: string | null;
  end_time: string | null;
  status: JobStatus;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ScheduleWithDetails extends Schedule {
  project_name: string;
  project_address: string | null;
  technician_name: string;
}

export interface CreateScheduleInput {
  project_id: string;
  technician_id: string;
  scheduled_date: string;
  start_time?: string;
  end_time?: string;
  notes?: string;
}

export interface UpdateScheduleStatusInput {
  status: JobStatus;
  notes?: string;
}

// ─── Job Note ─────────────────────────────────────────────────────
export type NoteType = 'technician' | 'internal';
export interface JobNote {
  id: string;
  schedule_id: string;
  author_id: string;
  note_type: NoteType;
  content: string;
  created_at: string;
}
export interface JobNoteWithAuthor extends JobNote {
  author_name: string;
}
export interface CreateJobNoteInput {
  schedule_id: string;
  note_type: NoteType;
  content: string;
}

// ─── Attachment ───────────────────────────────────────────────────
export type AttachmentCategory = 'before' | 'during' | 'after';
export interface Attachment {
  id: string;
  schedule_id: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  file_size: number | null;
  category: AttachmentCategory;
  uploaded_by: string;
  created_at: string;
}

// ─── Signature ────────────────────────────────────────────────────
export interface Signature {
  id: string;
  schedule_id: string;
  image_path: string;
  customer_name: string | null;
  uploaded_by: string;
  created_at: string;
}
export interface CreateSignatureInput {
  schedule_id: string;
  image_data: string; // base64 PNG
  customer_name?: string;
}

// ─── Audit Log ────────────────────────────────────────────────────
export interface AuditLog {
  id: string;
  schedule_id: string;
  user_id: string;
  action: string;
  old_status: string | null;
  new_status: string | null;
  metadata: unknown | null;
  created_at: string;
}

// ─── WebSocket Events ─────────────────────────────────────────────
export interface JobEvent {
  type: 'assignment' | 'travel_started' | 'arrived_onsite' | 'job_completed' | 'photo_uploaded' | 'signature_captured';
  schedule_id: string;
  project_name: string;
  technician_name: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// ─── Dashboard ────────────────────────────────────────────────────
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

### Validation schemas to add (`validation/index.ts`)

```typescript
// ─── Schedule Validation ──────────────────────────────────────────
export const createScheduleSchema = z.object({
  project_id: z.string().uuid(),
  technician_id: z.string().uuid(),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM').optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM').optional(),
  notes: z.string().max(2000).optional(),
});

export const updateScheduleSchema = z.object({
  start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM').optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM').optional(),
  notes: z.string().max(2000).optional(),
  technician_id: z.string().uuid().optional(),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const updateScheduleStatusSchema = z.object({
  status: z.enum(JOB_STATUSES as [string, ...string[]]),
  notes: z.string().max(2000).optional(),
});

// ─── Job Note Validation ──────────────────────────────────────────
export const createJobNoteSchema = z.object({
  schedule_id: z.string().uuid(),
  note_type: z.enum(['technician', 'internal']),
  content: z.string().min(1, 'Note content is required').max(10000),
});

// ─── Signature Validation ─────────────────────────────────────────
export const createSignatureSchema = z.object({
  schedule_id: z.string().uuid(),
  image_data: z.string().min(1, 'Signature image data is required'),
  customer_name: z.string().max(200).optional(),
});
```

Also add `fileName`, `mimeType` to the `createAttachmentSchema` concept and add it to exports.

---

## Phase 3 — Backend: Schedules API

### Files to create

| File | Purpose |
|---|---|
| `apps/api/src/db/queries/schedules.ts` | Schedule SQL queries |
| `apps/api/src/routes/schedules/index.ts` | Schedule API routes |

### Queries (`schedules.ts`)

Functions:
- `findAll(filters?: { date?: string; technician_id?: string; project_id?: string; status?: JobStatus })` — List with joins to projects/users
- `findById(id: string)` — Single schedule with full details
- `findByTechnician(technicianId: string, filters?: { date?: string; status?: JobStatus })` — For mobile job queue
- `findUnassigned()` — Schedules without technician (future use)
- `findByDateRange(from: string, to: string)` — Calendar view
- `create(data)` — Insert
- `update(id, data)` — Update (not status)
- `updateStatus(id, status, userId)` — Update status + write audit log in a transaction
- `getTodaysSummary()` — Dashboard aggregation

Important: `updateStatus` should:
1. BEGIN transaction
2. SELECT current status FOR UPDATE (row lock)
3. Validate transition is allowed
4. UPDATE schedule status
5. INSERT into audit_logs
6. COMMIT

Transition validation rules:
- scheduled → traveling (technician)
- traveling → on_site (technician, GPS)
- on_site → completed (technician)
- completed → office_review (office)
- office_review → closed (office)
- Any status → scheduled (office — reset/reassign)

### Routes (`schedules/index.ts`)

Endpoints:
- `GET /api/v1/schedules` — List with filters (auth required)
- `GET /api/v1/schedules/calendar?from=&to=` — Calendar range (auth required)
- `GET /api/v1/schedules/today` — Today's schedule summary (auth required)
- `GET /api/v1/schedules/unassigned` — Unassigned jobs queue (dispatch role)
- `GET /api/v1/schedules/my-jobs` — Current technician's jobs (field_technician)
- `GET /api/v1/schedules/:id` — Single schedule details (auth required)
- `POST /api/v1/schedules` — Create schedule (admin, office_manager, dispatcher)
- `PUT /api/v1/schedules/:id` — Update schedule (admin, office_manager, dispatcher)
- `PATCH /api/v1/schedules/:id/status` — Update status (role-dependent)
  - Traveling/On Site/Completed → field_technician
  - Office Review/Closed → admin, office_manager
- `DELETE /api/v1/schedules/:id` — Delete schedule (admin only)

Role protection:
- `POST`, `PUT`, `DELETE` → admin, office_manager, dispatcher
- `PATCH status` to traveling/on_site/completed → field_technician (own jobs only)
- `PATCH status` to office_review/closed → admin, office_manager
- `GET my-jobs` → field_technician
- `GET /today` / `/unassigned` → admin, office_manager, dispatcher

---

## Phase 4 — Backend: Job Notes API

### Files to create

| File | Purpose |
|---|---|
| `apps/api/src/db/queries/job-notes.ts` | Job notes SQL queries |
| `apps/api/src/routes/notes/index.ts` | Job notes API routes |

Functions:
- `findBySchedule(scheduleId)` — List notes with author name
- `create(data)` — Insert note

Endpoints:
- `GET /api/v1/schedules/:scheduleId/notes` — List notes
- `POST /api/v1/schedules/:scheduleId/notes` — Create note
  - field_technician → can only create 'technician' type notes
  - office roles → can create 'internal' type notes
  - admin → can create either

---

## Phase 5 — Backend: Attachments (Photos) API

### Files to create

| File | Purpose |
|---|---|
| `apps/api/src/db/queries/attachments.ts` | Attachment SQL queries |
| `apps/api/src/routes/attachments/index.ts` | Attachment upload/list API |

Functions:
- `findBySchedule(scheduleId)` — List attachments
- `create(data)` — Insert
- `findById(id)` — Single
- `deleteById(id)` — Remove

Endpoints:
- `GET /api/v1/schedules/:scheduleId/attachments` — List
- `POST /api/v1/schedules/:scheduleId/attachments` — Upload
  - Accepts multipart form data with compressed image
  - Saves to `uploads/attachments/{scheduleId}/{uuid}.{ext}`
  - Validates file type (image/jpeg, image/png, image/webp)
  - Max file size: 5MB
- `GET /api/v1/attachments/:id/file` — Serve file
- `DELETE /api/v1/attachments/:id` — Delete (admin, own)

Upload directory config via `UPLOAD_DIR` env var, default: `./uploads`.

---

## Phase 6 — Backend: Signatures API

### Files to create

| File | Purpose |
|---|---|
| `apps/api/src/db/queries/signatures.ts` | Signature SQL queries |
| `apps/api/src/routes/signatures/index.ts` | Signature capture/list API |

Functions:
- `findBySchedule(scheduleId)` — List
- `create(data)` — Insert (receives base64, writes file to disk)

Endpoints:
- `GET /api/v1/schedules/:scheduleId/signatures` — List
- `POST /api/v1/schedules/:scheduleId/signatures` — Capture
  - Receives `{ image_data: "data:image/png;base64,...", customer_name?: string }`
  - Saves PNG to `uploads/signatures/{scheduleId}/{uuid}.png`
  - Stores path in DB
- `GET /api/v1/signatures/:id/file` — Serve file

---

## Phase 7 — Backend: Dashboard Aggregation

### Files to modify

| File | Changes |
|---|---|
| `apps/api/src/db/queries/schedules.ts` | Add `getDashboardSummary()` function |
| `apps/api/src/routes/schedules/index.ts` | Add dashboard endpoint (or new file) |

`getDashboardSummary()` returns:
- `today_schedule_count` — COUNT of schedules where scheduled_date = TODAY
- `active_technician_count` — COUNT DISTINCT technician_id WHERE status IN ('traveling','on_site') AND date = TODAY
- `completed_today_count` — COUNT WHERE status = 'completed' AND date = TODAY
- `late_jobs_count` — COUNT WHERE status = 'scheduled' AND start_time < NOW() AND date = TODAY
- `needs_review_count` — COUNT WHERE status = 'completed'
- `today_schedules` — Full schedule rows with project/tech names for today
- `active_technicians` — Technicians currently traveling or on-site

Dashboard endpoint:
- `GET /api/v1/dashboard` — Returns summary (admin, office_manager, dispatcher)

---

## Phase 8 — Backend: Register New Routes & WebSocket Events

### Files to modify

| File | Changes |
|---|---|
| `apps/api/src/index.ts` | Register new route modules |
| `apps/api/src/websocket/index.ts` | Add `broadcastJobEvent()` + update room joins |

### Route registration in `index.ts`

```typescript
import { scheduleRoutes } from './routes/schedules';
import { noteRoutes } from './routes/notes';
import { attachmentRoutes } from './routes/attachments';
import { signatureRoutes } from './routes/signatures';
import { dashboardRoutes } from './routes/dashboard';

await app.register(scheduleRoutes);
await app.register(noteRoutes);
await app.register(attachmentRoutes);
await app.register(signatureRoutes);
await app.register(dashboardRoutes);
```

### WebSocket additions

Add new event types to `websocket/index.ts`:
```typescript
export function broadcastJobEvent(event: JobEvent): void {
  if (!io) return;
  // Office staff
  io.to('tech:status').emit('job:update', event);
  // Specific technician
  io.to(`user:${event.schedule_id}`).emit('job:assigned', event);
}
```

Update room joins: technicians join `schedules:status` room for their jobs.

---

## Phase 9 — Frontend: Shared API Client

### Files to modify

| File | Changes |
|---|---|
| `apps/web/src/lib/api.ts` | Add schedule, note, attachment, signature, dashboard functions |

New functions:
```typescript
// ─── Schedule API ────────────────────────────────────────────────
export async function getSchedules(filters?: { date?: string; technician_id?: string; project_id?: string; status?: string }): Promise<ScheduleWithDetails[]>
export async function getCalendarSchedules(from: string, to: string): Promise<ScheduleWithDetails[]>
export async function getTodaysSchedule(): Promise<ScheduleWithDetails[]>
export async function getMyJobs(): Promise<ScheduleWithDetails[]>
export async function getUnassignedJobs(): Promise<ScheduleWithDetails[]>
export async function getSchedule(id: string): Promise<ScheduleWithDetails>
export async function createSchedule(data: CreateScheduleInput): Promise<Schedule>
export async function updateSchedule(id: string, data): Promise<Schedule>
export async function updateScheduleStatus(id: string, status: JobStatus, notes?: string): Promise<Schedule>
export async function deleteSchedule(id: string): Promise<void>

// ─── Job Notes API ───────────────────────────────────────────────
export async function getJobNotes(scheduleId: string): Promise<JobNoteWithAuthor[]>
export async function createJobNote(data: CreateJobNoteInput): Promise<JobNote>

// ─── Attachments API ─────────────────────────────────────────────
export async function getAttachments(scheduleId: string): Promise<Attachment[]>
export async function uploadAttachment(scheduleId: string, file: File, category: AttachmentCategory): Promise<Attachment>
export async function deleteAttachment(id: string): Promise<void>

// ─── Signatures API ──────────────────────────────────────────────
export async function getSignatures(scheduleId: string): Promise<Signature[]>
export async function captureSignature(data: CreateSignatureInput): Promise<Signature>

// ─── Dashboard API ───────────────────────────────────────────────
export async function getDashboardSummary(): Promise<DashboardSummary>
```

---

## Phase 10 — Frontend: Office Scheduling (Calendar)

### Files to create

| File | Purpose |
|---|---|
| `apps/web/src/app/(office)/schedule/page.tsx` | Server page for schedule |
| `apps/web/src/app/(office)/schedule/ScheduleClient.tsx` | Main schedule client component |
| `apps/web/src/components/office/CalendarView.tsx` | Day/week calendar rendering |
| `apps/web/src/components/office/ScheduleForm.tsx` | Create/edit schedule modal |
| `apps/web/src/components/office/UnassignedQueue.tsx` | Unassigned jobs panel |
| `apps/web/src/components/office/ScheduleCard.tsx` | Individual schedule card with drag support |

### Calendar View (`CalendarView.tsx`)
- Day view (default) with time slots (hourly rows)
- Week view toggle (7-day column layout)
- Each slot shows scheduled jobs as cards
- Cards show: time range, project name, technician name, status badge
- Color-coded by status
- Click card → open detail/edit modal

### Schedule Form (`ScheduleForm.tsx`)
- Project selector (dropdown of active projects)
- Technician selector (dropdown of field technicians)
- Date picker
- Time range inputs (start, end)
- Notes textarea
- Zod validation on submit

### Unassigned Queue (`UnassignedQueue.tsx`)
- List of jobs without technician assigned
- Drag onto calendar or click to assign
- Shows project name, date, time

### Drag-and-Drop Approach
Use HTML5 native drag-and-drop (no external library):
- `CalendarView` makes time slots droppable zones
- `UnassignedQueue` items and existing schedule cards are draggable
- On drop: call `createSchedule` (if from unassigned) or `updateSchedule` (if reassigning/date change)

### Schedule Page
- Server component: `SchedulePage` → renders `ScheduleClient`
- `ScheduleClient` manages view state (day/week), filters, modals
- Layout: sidebar (unassigned queue) + main area (calendar)

---

## Phase 11 — Frontend: Office Dashboard

### Files to modify

| File | Changes |
|---|---|
| `apps/web/src/app/(office)/dashboard/page.tsx` | Replace with full dashboard |
| `apps/web/src/components/office/DashboardWidgets.tsx` | New: Summary widgets |
| `apps/web/src/app/dashboard/DashboardClient.tsx` | Replace with full dashboard client |

### Dashboard Widgets (`DashboardWidgets.tsx`)
- **Today's Schedule** — List of today's scheduled jobs with status
- **Active Technicians** — Who is traveling or on site right now
- **Completed Today** — Count + list
- **Late Jobs** — Jobs past scheduled start time still in 'scheduled'
- **Needs Review** — Jobs in 'completed' status awaiting office review

### Dashboard Layout
```
┌─────────────────┬─────────────────┐
│  Today's Jobs   │  Active Techs   │
│  (6 scheduled)  │  (3 on site)    │
├─────────────────┴─────────────────┤
│  Completed Today     Late Jobs    │
│  (2)                 (1)          │
├───────────────────────────────────┤
│  Needs Review                     │
│  (3 completed jobs)               │
├───────────────────────────────────┤
│  Live Status Feed                 │
└───────────────────────────────────┘
```

---

## Phase 12 — Frontend: Technician Job Queue (Mobile)

### Files to create/modify

| File | Purpose |
|---|---|
| `apps/web/src/components/mobile/JobQueue.tsx` | New: Job list with tabs |
| `apps/web/src/components/mobile/JobCard.tsx` | New: Job card component |
| `apps/web/src/app/(mobile)/jobs/[id]/page.tsx` | New: Job detail server page |
| `apps/web/src/components/mobile/JobDetailClient.tsx` | New: Job detail client component |
| `apps/web/src/components/mobile/JobNotes.tsx` | New: Notes section |
| `apps/web/src/components/mobile/PhotoUpload.tsx` | New: Photo upload (camera/gallery) |
| `apps/web/src/components/mobile/SignaturePad.tsx` | New: Signature capture canvas |
| `apps/web/src/app/(mobile)/mobile/page.tsx` | Modify: Add job queue to home |

### Job Queue (`JobQueue.tsx`)
Three tabs:
1. **Today's Jobs** — Schedules for today, ordered by start_time
   - Each card shows: project name, address, time range, status badge
   - "Start Navigation" button → opens maps
   - "Contact Customer" button → tel: link
2. **Upcoming** — Future schedules
3. **Completed** — Past schedules with status 'completed', 'office_review', 'closed'

### Job Detail (`JobDetailClient.tsx`)
Full job information page:
- Header: Project name, address, contact info
- Status progress indicator (stepper showing all 6 statuses, current one highlighted)
- Action buttons for status transitions
- Notes section
- Photos section
- Signature section

### Status Action Buttons
- Current = 'scheduled' → Show "Start Traveling" button
- Current = 'traveling' → Show "Arrived On Site" button
- Current = 'on_site' → Show "Work Completed" button
- Each button calls `updateScheduleStatus` with confirmation dialog
- On status change: show loading state, then update UI

### Job Notes (`JobNotes.tsx`)
- List of notes for the job (technician + internal)
- Add note textarea + submit button
- Notes display: author name, timestamp, content, type badge

### Photo Upload (`PhotoUpload.tsx`)
- Three category sections: Before, During, After
- Each section has: existing photos grid + upload button
- Upload: calls `uploadAttachment()` with compressed image
- Uses `canvas.toBlob()` for client-side compression (max 1200px width, JPEG quality 0.7)
- Shows loading spinner during upload
- Click photo to enlarge

### Signature Pad (`SignaturePad.tsx`)
- HTML5 Canvas for signature drawing
- Clear button
- Confirm button → saves as PNG data URL → calls `captureSignature()`
- Optional customer name input
- Shows existing signatures

### Mobile Home Updates
In `MobileHomeClient.tsx`, replace the disabled "My Schedule" button with working navigation:
- "Today's Jobs" → navigates to `/mobile/jobs` (job queue)
- Job count badge

---

## Phase 13 — Frontend: WebSocket Notifications

### Files to modify

| File | Changes |
|---|---|
| `apps/web/src/hooks/useSocket.ts` | Add `job:update` and `job:assigned` event handling |
| `apps/web/src/components/office/LiveStatusFeed.tsx` | Add job event types to feed |

### Socket hook updates
Listen for new events:
- `job:update` — Status transitions → show in live feed
- `job:assigned` — New assignment → show notification toast

### Live feed updates
Add job event type display:
- `assignment` → "Assigned to [project]"
- `travel_started` → "Started traveling to [project]"
- `arrived_onsite` → "Arrived at [project]"
- `job_completed` → "Completed work at [project]"
- `photo_uploaded` → "Uploaded photo for [project]"
- `signature_captured` → "Captured signature for [project]"

---

## Phase 14 — Frontend: Navigation Updates

### Files to modify

| File | Changes |
|---|---|
| `apps/web/src/app/(office)/layout.tsx` | Add schedule link to office nav |
| `apps/web/src/app/(mobile)/layout.tsx` | Add job queue link to mobile nav |

### Office nav additions
Add to office header:
- "Schedule" link → `/office/schedule`
- "Dashboard" link → `/office/dashboard`
- Update existing "Projects" link

### Mobile nav additions
Add to mobile bottom nav:
- "Home" → clock in/out
- "Jobs" → job queue
- "History" → time history

---

## Phase 15 — Final Validation

### Files to create/modify

| File | Changes |
|---|---|
| Various | Ensure `pnpm build` passes |
| Various | Ensure `pnpm typecheck` passes |
| `docs/implementation/ROADMAP.md` | Move Sprint 3 to Completed |
| `CHANGELOG.md` | Add Sprint 3 entries |
| `docs/implementation/PROJECT_STATUS.md` | Update current status |
| `CLAUDE.md` | Update sprint info |

---

## Implementation Order

| Order | Phase | Why this order |
|---|---|---|
| 1 | Phase 1 — DB Migrations | Everything depends on the schema |
| 2 | Phase 2 — Shared Types & Validation | Both apps need the types |
| 3 | Phase 3 — Schedules API | Core feature, routes depend on it |
| 4 | Phase 4 — Job Notes API | Depends on schedules |
| 5 | Phase 5 — Attachments API | Depends on schedules |
| 6 | Phase 6 — Signatures API | Depends on schedules |
| 7 | Phase 7 — Dashboard API | Depends on schedule queries |
| 8 | Phase 8 — Route Registration & WS | Wires up all APIs |
| 9 | Phase 9 — Frontend API Client | Needs API endpoints ready |
| 10 | Phase 11 — Office Dashboard | Needs dashboard API |
| 11 | Phase 10 — Office Scheduling | Needs schedule API |
| 12 | Phase 12 — Technician Job Queue | Needs all APIs |
| 13 | Phase 13 — WebSocket Notifications | Uses existing Socket pattern |
| 14 | Phase 14 — Navigation | Connects everything |
| 15 | Phase 15 — Validation | Final checks |

---

## Files Summary

### New files: ~22

| Count | Location |
|---|---|
| 5 | `apps/api/src/db/migrations/` |
| 2 | `apps/api/src/db/queries/` |
| 5 | `apps/api/src/routes/` |
| 9 | `apps/web/src/components/`, `app/` |
| 1 | `docs/implementation/` |

### Modified files: ~12

| Count | Location |
|---|---|
| 2 | `packages/shared/src/` |
| 1 | `apps/api/src/index.ts` |
| 1 | `apps/api/src/websocket/index.ts` |
| 1 | `apps/web/src/lib/api.ts` |
| 2 | `apps/web/src/hooks/`, `components/` |
| 3 | `apps/web/src/app/(office)/`, `app/(mobile)/` |
| 2 | `docs/` |

---

## Risk Mitigation

| Risk | Mitigation |
|---|---|
| Drag-and-drop calendar is complex UI | Use native HTML5 DnD, no external dependency. Fall back to select+button if DnD proves too fragile. |
| Photo upload with no cloud storage | Use local filesystem (Render Disk). Easy to migrate to S3 later. |
| Client-side image compression quality | Use Canvas API at 0.7 quality, 1200px max width — balances quality vs size. |
| Status transitions must be atomic | Use DB transactions with row-level locking for status updates + audit log writes. |
| Large sprint scope | Phases are additive — each phase produces working, deployable code. |
