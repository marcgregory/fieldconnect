# Phase B — Technician Job Queue (Mobile)

## Scope

Build the technician-facing job queue UI into the existing mobile PWA. Read-only — no status transitions (those are Phase C).

## Deliverables

1. **My Jobs API** — `GET /api/v1/schedules/my-jobs` returns the logged-in technician's schedules
2. **Job Queue tabbed page** — Today / Upcoming / Completed
3. **Job Detail page** — full job info with Start Navigation + Contact Customer
4. **Updated mobile home** — "My Jobs" link replaces the disabled "My Schedule" button

## Implementation Plan

### Step 1 — Extend `ScheduleWithDetails` type

**File:** `packages/shared/src/types/index.ts`

Add `project_contact_name` and `project_contact_phone` fields to `ScheduleWithDetails`. These are needed for the job detail page's "Contact Customer" button.

### Step 2 — Add `findByTechnician` to schedules queries

**File:** `apps/api/src/db/queries/schedules.ts`

Add a new query function that fetches all schedules for a given technician, ordered by `scheduled_date` + `start_time`, with the additional project contact fields joined.

### Step 3 — Add `GET /api/v1/schedules/my-jobs` endpoint

**File:** `apps/api/src/routes/schedules/index.ts`

New route open to `field_technician` and `admin` roles. Calls `findByTechnician` with `request.user!.id`.

### Step 4 — Add `getMyJobs()` to the frontend API client

**File:** `apps/web/src/lib/api.ts`

Simple BFF proxy wrapper that calls `GET /api/v1/schedules/my-jobs`.

### Step 5 — Create `JobCard` component

**File:** `apps/web/src/components/mobile/JobCard.tsx`

Displays:
- Project name
- Project address
- Time range
- Color-coded status badge
- Tappable → navigates to `/jobs/[id]`

### Step 6 — Create `JobQueueClient` component

**File:** `apps/web/src/components/mobile/JobQueueClient.tsx`

Tabbed view with:
- Today's Jobs (scheduled_date === today, status in 'scheduled'|'traveling'|'on_site')
- Upcoming Jobs (scheduled_date > today, status in 'scheduled'|'traveling'|'on_site')
- Completed Jobs (status in 'completed'|'office_review'|'closed')

States: loading, error (with retry), empty (per-tab message), populated.

### Step 7 — Create `JobDetailClient` component

**File:** `apps/web/src/components/mobile/JobDetailClient.tsx`

Full job detail with:
- Project name, address, contact info
- Status badge
- Time range + notes
- "Start Navigation" button → opens maps with address
- "Contact Customer" button → `tel:` link
- Back button to jobs list

States: loading, error (with retry), not-found.

### Step 8 — Create server page for job detail

**File:** `apps/web/src/app/(mobile)/jobs/[id]/page.tsx`

Server component that gets the session, fetches schedule by ID, and renders `JobDetailClient`.

### Step 9 — Create job queue page

**File:** `apps/web/src/app/(mobile)/jobs/page.tsx`

Server component that renders `JobQueueClient`.

### Step 10 — Update mobile home page

**File:** `apps/web/src/components/mobile/MobileHomeClient.tsx`

Replace the disabled "My Schedule" button with an active "My Jobs" link that navigates to `/jobs`.

## Status Badge Colors

| Status | Color |
|---|---|
| scheduled | Blue |
| traveling | Amber |
| on_site | Green |
| completed | Gray |
| office_review | Purple |
| closed | Dark Gray |

## No New DB Migrations

Phase B uses the existing `schedules`, `projects`, and `users` tables. No schema changes needed.
