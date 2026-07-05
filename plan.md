# Technician Schedule Conflict Validation — Implementation Plan

## Overview

Add backend validation and frontend UI for technician schedule conflicts with a 30-minute travel buffer.

## Changes

### 1. Backend — Conflict Detection (`apps/api/src/db/queries/schedules.ts`)

- Add `findConflicts(technicianId, scheduledDate, startTime, endTime, excludeScheduleId?)` function
- SQL uses the conflict rule: `existing.start_time < (requested.end_time + 30min) AND (existing.end_time + 30min) > requested.start_time`
- Returns conflict rows with a computed `conflict_type`: `'overlap'` (direct overlap) or `'buffer'` (within 30 min buffer)

### 2. Backend — Route Validation (`apps/api/src/routes/schedules/index.ts`)

- **POST** (create): call `findConflicts` before inserting. If conflicts found, return `409` with error message like:
  `"Technician has another job "ABC Manufacturing" from 08:00 to 10:30. Minimum 30-minute buffer required."`
- **PUT** (update): same check, passing `excludeScheduleId` to exclude the currently-edited schedule
- Support `force: true` in request body — admin only. If admin sends `force: true`, skip conflict check.
- Wrap in try/catch with `ValidationError` handling (already exists)

### 3. Backend — Technician Availability (`apps/api/src/db/queries/technicians.ts`)

- Add `findTechnicianAvailabilityStatus(technicianId, date, startTime?, endTime?)` function
- Returns: `'available' | 'busy' | 'buffer_conflict'` and the conflicting schedule info

### 4. Backend — Technicians Route (`apps/api/src/routes/technicians/index.ts`)

- Modify `GET /api/v1/technicians/available` to accept query params: `date`, `start_time`, `end_time`
- When provided, each technician in the response includes `availability: 'available' | 'busy' | 'buffer_conflict'` and optional `conflict_schedule` info

### 5. Shared Types (`packages/shared/src/types/index.ts`)

- Add `TechnicianAvailability` interface:
  - All User fields + `availability: 'available' | 'busy' | 'buffer_conflict'` + `conflict_schedule: { project_name, start_time, end_time } | null`

### 6. Shared Validation (`packages/shared/src/validation/index.ts`)

- Add `force: z.boolean().optional()` to `createScheduleSchema` and `updateScheduleSchema`

### 7. Frontend — API Client (`apps/web/src/lib/api.ts`)

- Add `getAvailableTechnicians(date?: string, startTime?: string, endTime?: string)` — updated to pass time params
- Add `createSchedule` / `updateSchedule` now support the `force` flag

### 8. Frontend — Schedule Form (`apps/web/src/components/office/ScheduleForm.tsx`)

- Fetch technicians with availability status when date/time change
- Show availability badge in technician `<select>` options:
  - 🟢 Available
  - 🔴 Busy (overlap)
  - 🟡 Buffer conflict
- On conflict error from API:
  - If user is admin: show a confirmation dialog ("Technician has a conflict. Force assign anyway?")
  - On confirm: resubmit with `force: true`
  - If non-admin: show the error as-is (already handled)

### 9. Frontend — Calendar View (`apps/web/src/components/office/CalendarView.tsx`)

- When rendering ScheduleCards, detect overlapping/buffer-conflicting schedules in the same day
- Show a small warning icon on cards that have conflicts (subtle visual indicator)

### 10. Typecheck & Build

- Run `pnpm lint` and `pnpm build` to verify everything compiles
