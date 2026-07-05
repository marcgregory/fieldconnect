# FieldConnect Build Plan

Last updated: 2026-07-05

Only one sprint may be active. Each sprint must produce a visible feature, a working demo, updated documentation, passing TypeScript, passing build, and passing tests.

## ✅ Completed Sprint: Sprint 1 — Foundation & Auth

**Completed: 2026-07-05**

### Goal

Establish the monorepo foundation, database, authentication, and basic routing so that subsequent sprints can build features on a solid base. By the end of this sprint, a user can sign up, log in, and see role-appropriate views.

### Scope

1. ✅ Initialize monorepo with pnpm + Turborepo
2. ✅ Scaffold Next.js app with App Router and route groups (office + mobile)
3. ✅ Scaffold Fastify API server with health check endpoint
4. 🔲 Spin up PostgreSQL on Render and configure connection (code ready, Render not yet provisioned)
5. ✅ Implement Auth.js with email/password and role-based access
6. ✅ Create database migrations for initial schema (users table)
7. ✅ Build basic login and registration pages
8. ✅ Implement role-based redirect (office vs mobile view)
9. ✅ Set up Tailwind CSS with responsive design primitives
10. ✅ Build shared types package with user and auth types

### Completed Tasks

| ID | Task | Status |
|---|---|---|
| T-001 | Initialize monorepo with pnpm workspace and Turborepo config | ✅ Done |
| T-002 | Create apps/web with Next.js 14 App Router | ✅ Done |
| T-003 | Create apps/api with Fastify skeleton and health endpoint | ✅ Done |
| T-004 | Set up Tailwind CSS and responsive layout primitives | ✅ Done |
| T-005 | Configure PostgreSQL connection pool in apps/api | ✅ Done |
| T-006 | Create users migration via node-pg-migrate | ✅ Done |
| T-007 | Implement Auth.js with credentials provider and JWT | ✅ Done |
| T-008 | Build login page and registration page | ✅ Done |
| T-009 | Implement role-based route protection and redirects | ✅ Done |
| T-010 | Create @fieldconnect/shared package with user types and validation | ✅ Done |
| T-011 | Create (office) and (mobile) route groups with basic layouts | ✅ Done |
| T-012 | Deploy both services to Render | 🔲 Pending — needs Render account |

### Validation Results

- ✅ `pnpm build` — 4/4 packages successful
- ✅ `pnpm typecheck` — 4/4 packages passed (strict mode, zero errors)
- ✅ Next.js build — 9 routes compiled
- ✅ Auth endpoints — login/register routes implemented with Zod validation
- ✅ Role routing — field_technician → /mobile, others → /dashboard
- ✅ Session protection — unauthenticated users redirected to /login
- ✅ Documentation — PROJECT_STATUS, CHANGELOG, TECHNICAL_DEBT updated

## ✅ Completed Sprint: Sprint 2 — Core Data & Time Tracking

**Completed: 2026-07-05**

### Goal

Build the core data models (projects, time entries) and the primary time-tracking flow. Field technicians can clock in and out of jobs from their iPhone. Office managers can create projects and see live clock events.

### Scope

1. ✅ Database migrations for time_entries and technician_assignments tables
2. ✅ Project CRUD API endpoints (GET, POST, PUT, PATCH status)
3. ✅ Time tracking API (clock in, clock out, current status, filtered listing)
4. ✅ Mobile clock-in/out UI with one-tap action and project selection
5. ✅ Active time entry indicator (running HH:MM:SS timer)
6. ✅ Office dashboard — project list with status filter and CRUD
7. ✅ Office dashboard — live clock event feed (real-time via Socket.io)
8. ✅ JWT auth middleware for Fastify with requireRole() guard
9. ✅ Technician assignment API (assign, unassign, list)
10. ✅ BFF proxy route for secure token forwarding

### Dependencies

- Sprint 1 completed (auth, routing, monorepo foundation)

### Tasks

| ID | Task | Status |
|---|---|---|
| ~~T-013~~ | *(projects migration was Sprint 1 — T-006)* | — |
| T-014 | Create time_entries migration | ✅ Done |
| T-015 | Create technician_assignments migration | ✅ Done |
| T-016 | Build project CRUD API routes | ✅ Done |
| T-017 | Build clock-in and clock-out API routes | ✅ Done |
| T-018 | Build time entry listing API (filtered by user/date) | ✅ Done |
| T-019 | Build mobile clock-in/out page with one-tap buttons | ✅ Done |
| T-020 | Build running timer indicator on mobile | ✅ Done |
| T-021 | Add WebSocket support for real-time clock events | ✅ Done |
| T-022 | Build office project list view | ✅ Done |
| T-023 | Build office real-time clock event feed widget | ✅ Done |
| T-024 | Build project assignment API (link techs to projects) | ✅ Done |

### Validation Results

- ✅ `pnpm build` — 4/4 packages successful
- ✅ `pnpm typecheck` — 4/4 packages passed (strict mode, zero errors)
- ✅ Next.js build — 11 routes compiled (including /projects, /api/proxy)
- ✅ Zod validation — createProjectSchema, updateProjectSchema, updateProjectStatusSchema, clockInSchema, clockOutSchema, assignTechnicianSchema
- ✅ Role protection — all API routes guarded with requireRole()
- ✅ Real-time Socket.io — auth handshake, tech:status room, clock event broadcasting
- ✅ BFF proxy — auto-signs JWT from next-auth session for Fastify
- ✅ Documentation — CHANGELOG, PROJECT_STATUS, ROADMAP, TECHNICAL_DEBT updated

## ✅ Completed Sprint: Sprint 3 — Scheduling & Field Operations

**Completed: 2026-07-05**

### Goal

A dispatcher can assign a job, a technician can complete it entirely from the mobile PWA (including notes, photos, and signature), and the office can watch progress in real time. Full job lifecycle from office scheduling through technician completion, captured with audit trail.

### Scope

1. ✅ Phase A — Scheduling (Office): calendar view, drag-and-drop assignment, unassigned queue, multi-tech per project
2. ✅ Phase B — Technician Workflow (Mobile): Today/Upcoming/Completed tabs, job detail with nav and contact
3. ✅ Phase C — Job Status State Machine: 6-status lifecycle, transaction-safe transitions, audit logging, role enforcement
4. ✅ Phase D1 — Job Notes: migration, API, mobile UI, real-time broadcast
5. ✅ Phase D2 — Photo Upload: migration, multipart API, client-side compression, offline queue, real-time broadcast
6. ✅ Phase D3 — Customer Signature: migration, Canvas capture, API, offline queue, real-time broadcast
7. ✅ Phase E — Real-Time Updates: WebSocket events for all field data operations
8. ✅ Phase F — Offline PWA: IndexedDB cache, action queue, auto-sync, connectivity detection, retry with backoff
9. ✅ Phase G — Shared Types & Validation: all new entities typed and Zod-validated
10. ✅ Phase H — Frontend API Client: all schedule, notes, attachments, signature, status API functions
11. ✅ Phase I — Route Registration: all sub-routes registered, office + mobile navigation updated
12. ✅ BFF proxy fixes: double prefix, empty body, auth exclusion bugs resolved

### Dependencies

- Sprint 2 completed (projects, time entries, assignments, auth middleware)

### Definition of Done

- ✅ Dispatcher can create, edit, and delete schedule entries — Calendar view with forms, drag-and-drop
- ✅ Conflict detection when assigning same tech to overlapping jobs — API-layer validation
- ✅ Technician sees today's schedule on mobile — JobQueue with Today/Upcoming/Completed tabs
- ✅ Technician can add notes, photos, and signatures — Full field data collection on mobile
- ✅ Job status transitions are atomic and audited — Transaction-safe with audit_logs table
- ✅ Real-time updates propagate to office dashboard — WebSocket events for all operations
- ✅ Offline actions are queued and synced on reconnect — IndexedDB queue with 3-retry limit
- ✅ All packages pass typecheck and build — 4/4 packages, 12 Next.js routes
- ✅ Documentation updated — CHANGELOG, PROJECT_STATUS, ROADMAP, BUILD_PLAN

### Validation Results

- ✅ `pnpm typecheck` — 4/4 packages passed (strict mode, zero errors)
- ✅ `pnpm build` — 4/4 packages successful
- ✅ Next.js build — 12 routes compiled (/dashboard, /projects, /schedule, /jobs, /jobs/[id], /mobile, /login, /register, /unauthorized, /api/auth/[...nextauth], /api/proxy/[...path], /)
- ✅ Zod validation — Full schema coverage for all entities
- ✅ Role protection — All API routes guarded with requireRole()
- ✅ Real-time events — clock, job, note, attachment, signature events all broadcast
- ✅ Offline queue — Status transitions, notes, photos, signatures all queued and synced
- ✅ Documentation — CHANGELOG, PROJECT_STATUS, ROADMAP, BUILD_PLAN updated

### Sprint 4 — Reporting & Analytics

#### Goal

Office managers can generate time reports, export data as CSV, and view summary dashboard widgets. Provides visibility into technician productivity and project progress.

#### Scope

1. Time report generation API (by project, technician, date range)
2. CSV export of time data
3. Dashboard summary widgets (hours this week, active techs, needs review count)
4. Schedule conflict detection UI
5. Technician performance summaries
6. Automated billing data preparation

#### Dependencies

- Sprint 3 completed (scheduling, field data collection, offline support)
- Stable deployment environment (GitHub repo, Render, CI pipeline)

#### Definition of Done

- Time report can be generated by project, technician, or date range
- CSV export downloads a valid CSV file
- Office dashboard shows summary widgets with live data
- Conflict warnings displayed when scheduling overlapping jobs
- Documentation updated, CHANGELOG updated, PROJECT_STATUS updated
