# Changelog

All notable project changes should be documented here. Keep this file versioned and historical; do not use it as a current status report.

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
