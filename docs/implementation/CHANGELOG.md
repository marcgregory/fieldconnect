# Changelog

All notable project changes should be documented here. Keep this file versioned and historical; do not use it as a current status report.

## v0.5.1 — 2026-07-06

### Added

- **Full lifecycle smoke test**: `scripts/smoke-test.sh` — validates the entire user journey end-to-end: registration, login, project CRUD, time tracking, schedule workflow, job status transitions, field notes/photos/signatures, offline queue, reports, and CSV export

## v0.5.0 — 2026-07-06

### Changed

- **Simplified status workflow**: removed `office_review` from the state machine. New flow: `scheduled → traveling → on_site → completed → closed`. The Review page reads `status = 'completed'` which is now the single source of truth for work pending review.
- **DB migration 007**: converts all existing `office_review` records to `completed` and tightens the CHECK constraint.

### Fixed

- **Status mismatch bug**: Technician app was still writing `office_review` after the workflow was simplified. The Review page only queried `status = 'completed'`, so completed jobs disappeared from the review queue. Removed `office_review` from shared types, API validation rules, DB constraint, and all UI components (mobile + office).

## v0.1.0 — 2026-07-05

### Added

- Foundation documentation: PRD, project scope, architecture, tech stack, deployment strategy
- Monorepo structure with pnpm + Turborepo
- Next.js frontend app with App Router and route groups (office + mobile)
- Fastify API backend skeleton with health check
- PostgreSQL database schema for auth (users table, projects table)
- Auth.js integration for authentication and role-based access control
- Tailwind CSS with responsive primitives for mobile-first design
- Shared types package (@fieldconnect/shared) with TypeScript interfaces and Zod validation
- Shared UI component library (@fieldconnect/ui) with Button, Card, Input, Spinner
- ADRs for key decisions (no ORM, PostgreSQL on Render, PWA over native)
- Register and login pages with role selection
- Role-based routing: field technicians → `/mobile`, office staff → `/dashboard`
- Mobile-optimized home page with iPhone viewport (430px max-width)
- Protected dashboard with session-aware content
- Fastify API with health endpoints (`/api/v1/health`, `/api/v1/health/db`)
- Auth API endpoints (`POST /api/v1/auth/login`, `POST /api/v1/auth/register`)
- Database migration system via `node-pg-migrate`
- PWA manifest with icons for add-to-home-screen
- Unauthorized page for role-restricted routes
- `.env.example` with all required environment variables
- Project roadmap with 3 sprint horizon
- Sprint 1 build plan with full task breakdown

### Changed

(N/A — initial foundation)

### Fixed

(N/A — initial foundation)

### Removed

(N/A — initial foundation)

## v0.2.0 — 2026-07-05

### Added

- **Database migrations**: `time_entries` table (clock in/out, break tracking, notes) and `technician_assignments` table (many-to-many project-user links)
- **Auth middleware**: JWT verification via `jose` with `NEXTAUTH_SECRET`, `requireRole()` route guard for role-based access control
- **Socket.io WebSocket server**: attached to Fastify HTTP server, JWT-authenticated handshake, `tech:status` room for real-time clock event broadcast
- **Projects CRUD API**: `GET/POST /api/v1/projects`, `GET/PUT /api/v1/projects/:id`, `PATCH /api/v1/projects/:id/status` — all Zod-validated and role-protected
- **Time tracking API**: `POST /api/v1/time-entries/clock-in`, `POST /api/v1/time-entries/clock-out`, `GET /api/v1/time-entries/current`, `GET /api/v1/time-entries` — with active-entry conflict detection and duration calculation
- **Technician assignment API**: `POST/DELETE /api/v1/projects/:id/assign/:userId`, `GET /api/v1/projects/:id/assignments`, `GET /api/v1/technicians/assignments`, `GET /api/v1/technicians/available`
- **BFF proxy route**: `/api/proxy/[...path]` in Next.js forwards requests to Fastify with auto-signed JWT tokens
- **Shared types and validation**: `Project`, `TimeEntry`, `ActiveTimeEntry`, `TechnicianAssignment`, `ClockEvent` types; `createProjectSchema`, `updateProjectSchema`, `updateProjectStatusSchema`, `clockInSchema`, `clockOutSchema`, `assignTechnicianSchema` validation schemas
- **Office projects page**: `/(office)/projects/` with full CRUD, status management, technician assignment, status filter tabs
- **Live status feed widget**: Socket.io-powered real-time clock event feed on dashboard and projects page
- **Mobile clock-in/out UI**: project selection, one-tap clock in, live HH:MM:SS timer, confirm clock out, duration summary
- **Mobile time history**: this week's time entries with project name, duration, and details
- **Dashboard navigation**: Projects link, live feed integration, system status reflects active time tracking
- **Office route group**: `/(office)/layout.tsx` with role-based access (blocks field_technician)

### Changed

- Updated `DashboardClient` with real-time feed and projects navigation
- Updated `MobileHomeClient` with functional clock-in/out and time history
- Updated `MobilePage` to pass user data to client components

### Fixed

- (none)

## v0.3.0 — 2026-07-05

### Added

- **Job status state machine**: `PATCH /api/v1/schedules/:id/status` with transaction-safe status transitions, row-level locking, and role enforcement
- **audit_logs table migration**: `005_create-audit-logs.sql` — insert-only history for every status transition (schedule_id, user_id, old_status, new_status, metadata)
- **Status transition validation**: strict rules — technician advances own jobs `scheduled → traveling → on_site → completed`, office advances `completed → office_review → closed`, admin can correct any status
- **WebSocket job events**: `broadcastJobEvent()` emits `job:update` to `tech:status` room on every status change
- **Workflow buttons on mobile job detail**: "Start Traveling", "Arrived On Site", "Mark Complete" with confirmation dialog, refetch after status change
- **ScheduleReviewPanel component**: Office-side review controls — "Move to Office Review" and "Close Job" buttons with optional notes
- **Socket.io hook update**: `useSocket` now subscribes to `job:update` events alongside `tech:status`
- **Shared types**: `AuditLog`, `AuditLogWithUser`, `JobEvent` interfaces; `updateScheduleStatusSchema` Zod validation

### Changed

- `JobDetailClient` — added workflow progression buttons with loading states and confirmation overlay
- `useSocket` — added `lastJobEvent` and `jobEvents` to returned interface
- `ScheduleWithDetails` query — `findById` returns full enriched schedule including project contact info

### Fixed

- (none)

## v0.4.0 — 2026-07-05

### Added

- **Phase D1 — Job Notes**: `job_notes` table migration, API endpoints (list, create), mobile note input with offline queue, real-time `note:added` WebSocket events
- **Phase D2 — Photo Upload**: `job_attachments` table migration, multipart upload API, client-side image compression (Canvas API, 1200px max, JPEG 0.7 quality), offline photo queue with IndexedDB blob storage, `attachment:update` WebSocket events
- **Phase D3 — Customer Signature**: `signatures` table migration, base64 PNG capture API, `SignatureCanvas` Canvas drawing component, offline queue, `signature:captured` WebSocket events
- **Phase E — Real-Time Updates**: Full WebSocket event coverage — `broadcastNoteEvent()`, `broadcastAttachmentEvent()`, `broadcastSignatureEvent()` for all field data types
- **Phase F — Offline-First PWA**: IndexedDB wrapper (`db.ts`) with jobs cache, action queue, blob store; `useOfflineSync` hook with auto-sync on reconnect; `OfflineIndicator` component; connectivity probe; FIFO queue with 3-retry limit
- **Phase G — Shared Types & Validation**: `JobNote`, `JobAttachment`, `Signature`, `AuditLog`, `JobEvent`, `NoteEvent`, `AttachmentEvent`, `SignatureEvent` types; `createJobNoteSchema`, `createJobAttachmentSchema`, `createSignatureSchema`, `updateScheduleStatusSchema` Zod schemas
- **Phase I — Route Registration & Navigation**: Mobile bottom nav (Home | Jobs | History), office schedule page, `ScheduleReviewPanel`
- Fastify multipart (`@fastify/multipart`) and static file serving (`@fastify/static`)
- `useSocket` — listener system: `onJobUpdate`, `onNoteAdded`, `onAttachmentUpdate`, `onSignatureCaptured`
- File storage service for disk-based attachment uploads

### Changed

- `JobDetailClient` — full field data sections (notes, photos, signatures), offline handling, confirmation dialogs, sticky bottom action bar
- BFF proxy — fixed double `/api/v1/` prefix, empty JSON body error, and auth hook excluding `/auth/token`
- `authHook` — narrowed public endpoints to only `/login` and `/register`
- `bffFetch` — only sets `Content-Type: application/json` when body exists
- `useSocket` — added listener registration pattern for targeted subscriptions
- `LiveStatusFeed` — displays job events alongside clock events

### Fixed

- BFF proxy: double `/api/v1/` prefix in proxied requests
- BFF proxy: empty JSON body error (`FST_ERR_CTP_EMPTY_JSON_BODY`) on bodiless POST requests
- BFF proxy: `POST /auth/token` returning 401 due to overly broad auth hook exclusion of all `/api/v1/auth/*` routes

## v0.5.0 — 2026-07-05

### Added

- **Sprint 4 — Reporting & Analytics** ✅
  - Time entries report API: `GET /api/v1/reports/time-entries` with date range, project, and technician filters
  - Hours by technician API: `GET /api/v1/reports/technicians` — aggregated hours per tech
  - Hours by project API: `GET /api/v1/reports/projects` — aggregated hours per project with technician count
  - Dashboard summary API: `GET /api/v1/dashboard/summary` — hours this week, active techs, completed today, needs review, late jobs
  - CSV export endpoint: `GET /api/v1/reports/time-entries.csv` — downloadable CSV with same filters
  - Dashboard summary cards: live-updating 5-card widget on office dashboard
  - Reports page with tabbed view (Time Entries / By Technician / By Project) and date range picker
  - CSV download button on reports page
  - Shared types: `TimeEntryReportRow`, `HoursSummaryRow`, `ProjectSummaryRow`, `DashboardSummary`, `ReportFilters`
  - Frontend API client functions for all report and dashboard endpoints

### Changed

- `DashboardClient` — added `DashboardSummaryCards` widget and Reports nav link
- Office header nav — added Reports link
