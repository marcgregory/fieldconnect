# Revision-Based Rework — Implementation Plan

## Problem

The current rework workflow simply transitions `completed → on_site`, destroying the
distinction between the original completion and rework evidence. If a technician
uploaded before/during/after photos, a signature, and notes, and the customer later
requests a cable relocation, those files should be preserved as the "Original Submission."

## Solution

A full revision-based rework system where each rework appends new evidence rather than
replacing previous evidence. The original completion is never overwritten.

---

## Phase 1 — Domain & Data Layer

### 1A. Add `rework_required` to JobStatus

**File:** `packages/shared/src/types/index.ts`

- Add `'rework_required'` to the `JobStatus` union type and `JOB_STATUSES` array.
- Add `'rework_evidence'` to `NoteType` and `NOTE_TYPES`.
- Update `VALID_TRANSITIONS` in `apps/api/src/db/queries/schedules.ts`:
  - `completed → rework_required` (office requests rework)
  - `rework_required → on_site` (technician resumes work)
  - `rework_required → completed` (technician completes rework)
- Update `updateScheduleStatusSchema` validation to accept the new status.

### 1B. New migration: `018_create-rework-requests.sql`

```sql
CREATE TABLE rework_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  requested_by UUID NOT NULL REFERENCES users(id),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_rework_requests_schedule ON rework_requests(schedule_id);
```

### 1C. New migration: `019_add-rework-version.sql`

Add `rework_version` to evidence tables so we can group by rework cycle:

```sql
ALTER TABLE job_notes ADD COLUMN rework_version INT NOT NULL DEFAULT 0;
ALTER TABLE job_attachments ADD COLUMN rework_version INT NOT NULL DEFAULT 0;
ALTER TABLE signatures ADD COLUMN rework_version INT NOT NULL DEFAULT 0;

CREATE INDEX idx_job_notes_rework ON job_notes(schedule_id, rework_version);
CREATE INDEX idx_job_attachments_rework ON job_attachments(schedule_id, rework_version);
CREATE INDEX idx_signatures_rework ON signatures(schedule_id, rework_version);
```

### 1D. New shared types

**File:** `packages/shared/src/types/index.ts`

```typescript
export interface ReworkRequest {
  id: string;
  schedule_id: string;
  reason: string;
  requested_by: string;
  requested_by_name?: string;
  requested_at: string;
  resolved_at: string | null;
  status: 'open' | 'completed';
  created_at: string;
}
```

Add `rework_version?: number` to `JobNote`, `JobAttachment`, and `Signature`.

---

## Phase 2 — API Layer

### 2A. New rework request queries

**File:** `apps/api/src/db/queries/rework.ts` (new)

| Function | Description |
|----------|-------------|
| `createReworkRequest(scheduleId, reason, userId)` | INSERT into `rework_requests`, return row |
| `findReworkRequestsBySchedule(scheduleId)` | SELECT with user_name JOIN, ORDER BY requested_at |
| `getLatestOpenRework(scheduleId)` | Single open rework request, null if none |
| `resolveReworkRequest(id)` | UPDATE status=completed, resolved_at=NOW() |
| `getCurrentReworkVersion(scheduleId)` | MAX(rework_version) across evidence tables, or 0 |

### 2B. Updated `updateStatus` transaction in `schedules.ts`

Update the `updateStatus` function to handle `rework_required`:
- When transitioning `completed → rework_required`: require a reason (passed in notes/metadata)
- When transitioning `rework_required → on_site`: auto-create next rework version context
- When transitioning `on_site → completed` and there's an open rework: resolve the rework request

### 2C. New API routes

**File:** `apps/api/src/routes/schedules/rework.ts` (new)

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| POST | `/api/v1/schedules/:id/rework` | office/admin | Create rework request + transition to `rework_required` |
| GET | `/api/v1/schedules/:id/rework` | any auth'd | List rework requests for schedule |
| PATCH | `/api/v1/schedules/:id/rework/:rid/resume` | tech/admin | Resume work (transition to `on_site`) |
| PATCH | `/api/v1/schedules/:id/rework/:rid/complete` | tech/admin | Mark rework complete |

Register these routes in `apps/api/src/routes/schedules/index.ts`.

### 2D. Updated field data queries

**File:** `apps/api/src/db/queries/job-notes.ts`, `job-attachments.ts`, `signatures.ts`

Update INSERT queries to accept optional `rework_version` parameter (defaults to 0).
Update SELECT queries to include `rework_version` in response rows.

### 2E. Evidence endpoint by rework version

**File:** `apps/api/src/routes/schedules/job-notes.ts`, `job-attachments.ts`, `signatures.ts`

Add optional query parameter `?rework_version=N` to filter evidence by version.
Add endpoint or modifier `?group_by_rework=true` that returns evidence grouped by version.

---

## Phase 3 — Office UI (ReviewClient.tsx)

### 3A. Request Rework → creates rework_request

Replace the current simple status-change approach:

1. "Request Rework" button opens the modal (keep existing modal UI)
2. Modal now calls `POST /api/v1/schedules/:id/rework` instead of `updateScheduleStatus`
3. Response includes the new `rework_required` status and the created `ReworkRequest`

### 3B. Evidence grouped by revision

When viewing a completed/rework job, fetch evidence with rework version info.
Display in sections:

```
Original Submission
  ├─ Before Photos (3)
  ├─ During Photos (2)
  ├─ After Photos (3)
  ├─ Signature ✓
  └─ Technician Notes

Rework 1 — 2024-03-15
  ├─ After Photos (1)
  └─ Technician Note

Rework 2 — 2024-03-18
  ├─ After Photos (2)
  ├─ Technician Note
  └─ Signature ✓
```

### 3C. Rework request history panel

When expanded, show a "Rework History" section listing all rework requests
with their reason, who requested, and status.

---

## Phase 4 — Technician UI (JobDetailClient.tsx)

### 4A. Rework required banner

If `schedule.status === 'rework_required'`, show a prominent banner at the top:

```
⚠ Rework Requested

Reason: Customer requested cable relocation.
Requested by: John (Office Manager)
Requested at: Mar 15, 2024 2:30 PM

[ Resume Work ]
```

The "Resume Work" button transitions status to `on_site`.

### 4B. Read-only original evidence

When technician resumes work (`status === 'on_site'` with `rework_version > 0`):

- All previously uploaded evidence remains visible but read-only
- Delete buttons are hidden on original evidence
- Labels show which rework version they belong to

### 4C. Additional evidence for rework

Technician can add:
- Additional after photos (most common for rework)
- Additional during photos
- "Rework Note" — a new note with type `note_type: 'technician'` and the current `rework_version`

These are appended with the incremented version, never replacing originals.

---

## Phase 5 — Audit Trail

**File:** `apps/api/src/db/queries/schedules.ts` (updateStatus)

Add specific audit log actions:

| Action | Trigger | Metadata |
|--------|---------|----------|
| `rework_requested` | completed → rework_required | reason, rework_request_id |
| `rework_resumed` | rework_required → on_site | rework_request_id, version |
| `rework_completed` | on_site → completed (during rework) | rework_request_id |

The audit log already records `old_status` and `new_status`, so the status transitions
alone tell part of the story. These action-specific entries provide the human-readable
narrative with richer metadata.

---

## Migration Path

1. Run `018_create-rework-requests.sql` — no data loss, backward compatible
2. Run `019_add-rework-version.sql` — adds columns with DEFAULT 0, no data loss
3. Deploy API changes — new endpoints are additive
4. Deploy frontend changes — new UI paths for rework, existing paths unchanged
5. All existing records get `rework_version = 0` (original submission)

Existing data is fully preserved. The transition is seamless — no backfill needed.

---

## Files Changed Summary

| File | Change |
|------|--------|
| `packages/shared/src/types/index.ts` | Add `rework_required` to JobStatus, add `rework_version` to evidence types |
| `packages/shared/src/validation/index.ts` | Accept new status in schema |
| `apps/api/src/db/migrations/018_create-rework-requests.sql` | **NEW** — Create rework_requests table |
| `apps/api/src/db/migrations/019_add-rework-version.sql` | **NEW** — Add rework_version columns |
| `apps/api/src/db/queries/schedules.ts` | Update VALID_TRANSITIONS, updateStatus logic |
| `apps/api/src/db/queries/rework.ts` | **NEW** — Rework request queries |
| `apps/api/src/routes/schedules/index.ts` | Register new rework routes |
| `apps/api/src/routes/schedules/rework.ts` | **NEW** — Rework API routes |
| `apps/api/src/routes/schedules/job-notes.ts` | Accept/filter by rework_version |
| `apps/api/src/routes/schedules/job-attachments.ts` | Accept/filter by rework_version |
| `apps/api/src/routes/schedules/signatures.ts` | Accept/filter by rework_version |
| `apps/web/src/lib/api.ts` | Add rework API client functions |
| `apps/web/src/components/office/ReviewClient.tsx` | Group evidence by revision, new rework request flow |
| `apps/web/src/components/mobile/JobDetailClient.tsx` | Rework banner, read-only original evidence, additional uploads |
