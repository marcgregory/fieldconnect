# Fix Review Queue for Per-Technician Scoping

## Problem

In multi-technician schedules, the Review page shows all technicians even if only one has completed. The review queue is schedule-based, not technician-assignment-based.

## Root Causes

1. **`findForReview()` returns one row per schedule**, not per completed technician assignment. It filters correctly (`schedule_technicians.status IN ('completed', 'rework_required')`) in the WHERE EXISTS clause, but GROUPs BY schedule, so one schedule = one card even when only 1 of 2 techs completed.

2. **Evidence counts are schedule-wide** (`SELECT COUNT(*) FROM job_attachments WHERE schedule_id = s.id`), not scoped to the completing technician.

3. **Frontend evidence fetches don't pass `technician_id`** — `getJobNotes(scheduleId)`, `getJobAttachments(scheduleId)`, `getJobSignatures(scheduleId)` all omit the optional query parameter. The API supports it (the query functions accept `technicianId?`), but the frontend never sends it.

4. **`handleClose` and `handleRework` don't specify `technician_id`** — `updateScheduleStatus(schedule.id, 'closed')` defaults to updating ALL technicians. `requestRework(schedule.id, reason)` doesn't send `technician_id` even though the API requires it.

## Design Decision: Return Review Items, Not Schedule Rows

The review queue will return **one item per completed technician assignment**, using a new `ReviewItem` type. Each card in the UI represents one technician's completed work.

## Changes

### 1. New Type: `ReviewItem` (shared package)

**File:** `packages/shared/src/types/index.ts`

Add a new interface:
```ts
export interface ReviewItem {
  schedule_id: string;
  technician_id: string;
  technician_name: string;
  status: JobStatus;
  completed_at: string | null;
  // Schedule/project info
  project_id: string;
  project_name: string;
  project_address: string | null;
  scheduled_date: string;
  start_time: string | null;
  end_time: string | null;
  project_latitude: number | null;
  project_longitude: number | null;
  project_geofence_radius: number;
  // Clock-in GPS from this technician
  clock_in_lat: number | null;
  clock_in_lng: number | null;
  clock_in_accuracy: number | null;
  clock_in_time: string | null;
  // Per-tech evidence counts
  note_count: number;
  attachment_count: number;
  signature_count: number;
  // Rework
  current_rework_version: number;
  has_open_rework: boolean;
  // Other techs on schedule (for display context)
  other_technicians: Array<{ technician_id: string; technician_name: string; status: JobStatus }>;
}
```

### 2. New Query: `findCompletedTechnicians()` (API)

**File:** `apps/api/src/db/queries/schedules.ts`

Add a new function that queries `schedule_technicians WHERE status IN ('completed', 'rework_required')` and joins all necessary schedule/project/clock-in data. Returns one row per completed tech assignment.

Key SQL changes from `findForReview`:
- FROM `schedule_technicians` instead of `schedules`
- Evidence counts filter by `technician_id`
- Returns per-tech GPS (first matching time_entry for this tech)
- Includes `other_technicians` as a JSON subquery (other techs on same schedule, any status)

### 3. New Route: Updated Review API (API route)

**File:** `apps/api/src/routes/schedules/index.ts`

Change the `/api/v1/schedules/review` handler to call `findCompletedTechnicians()` instead of `findForReview()`.

### 4. Updated API Client (Frontend)

**File:** `apps/web/src/lib/api.ts`

- Update `getReviewQueue()` return type from `ScheduleWithDetails[]` to `ReviewItem[]`
- Add `technician_id` parameter to evidence fetch functions:
  - `getJobNotes(scheduleId, technicianId?)` 
  - `getJobAttachments(scheduleId, technicianId?)`
  - `getJobSignatures(scheduleId, technicianId?)`
- Add `getJobSignatures` signature update for `technician_id` param

### 5. Rewrite ReviewClient (Frontend)

**File:** `apps/web/src/components/office/ReviewClient.tsx`

Major changes:
- State: `ReviewItem[]` instead of `ScheduleWithDetails[]`
- Each card represents ONE technician's review, not one schedule
- Card header shows: tech name, project name, date, completion status
- Group cards by schedule (same schedule = same project, but separate tech cards)
- When expanding, pass `technician_id` to evidence fetches
- `handleClose` sends `technician_id` to only close this specific tech
- `handleRework` sends `technician_id` to only rework this specific tech
- Remove the `technician_name` from schedule-level — it's now at card level
- Remove `groupEvidenceByTech` — evidence is already per-tech from the API
- Evidence checklist evaluates only this tech's evidence
- Show "other technicians on schedule" section in the expanded view

## Acceptance Criteria

1. Marc status = `on_site`, Goblin status = `completed`
2. Review page shows Goblin only
3. Marc does NOT appear in review
4. Marc's evidence is NOT shown in Goblin's card
5. `handleClose` for Goblin only closes Goblin (not Marc)
6. `handleRework` for Goblin targets Goblin only
7. `schedules.status` is NOT used to decide who appears in review — only `schedule_technicians.status`

## Files Changed

| File | Change |
|------|--------|
| `packages/shared/src/types/index.ts` | Add `ReviewItem` type |
| `apps/api/src/db/queries/schedules.ts` | Add `findCompletedTechnicians()` query |
| `apps/api/src/routes/schedules/index.ts` | Update review route to use new query |
| `apps/web/src/lib/api.ts` | Update types, add technician_id to evidence fetches |
| `apps/web/src/components/office/ReviewClient.tsx` | Rewrite for `ReviewItem` |
