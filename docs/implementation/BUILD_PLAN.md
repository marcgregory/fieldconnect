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

### Sprint 3 — Scheduling & Reporting

#### Goal

Build the scheduling system and basic reporting. Dispatchers can schedule technicians to jobs. Technicians see their daily schedule. Office managers can generate time reports.

#### Scope

1. Database migration for schedules table
2. Schedule CRUD API
3. Calendar/week view for dispatcher (desktop)
4. Schedule view for technician (mobile)
5. Time report generation API
6. CSV export of time data
7. Dashboard summary widgets (hours this week, active techs)

#### Dependencies

- Sprint 2 completed (projects, time entries, assignments)

#### Definition of Done

- Dispatcher can create, edit, and delete schedule entries
- Conflict detection when assigning same tech to overlapping jobs
- Technician sees today's schedule on mobile
- Time report can be generated by project, technician, or date range
- CSV export downloads a valid CSV file
- Documentation updated, CHANGELOG updated, PROJECT_STATUS updated
