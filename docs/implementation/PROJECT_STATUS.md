# FieldConnect Project Status

Last updated: 2026-07-07

This document is a snapshot. It is not a changelog.

## Current Sprint

Sprint 6 — Customer Completion Report PDF 🚧

## Current Progress

### Revision-Based Rework — Complete ✅ (Sprint 6.1)
- `rework_required` status added to the job state machine ✅
- `rework_requests` table tracks each rework with reason, requester, and status ✅
- `rework_version` column on `job_notes`, `job_attachments`, `signatures` for revision grouping ✅
- New API endpoints: create rework request, list rework requests, resume rework, complete rework ✅
- Office Review page groups evidence by revision (Original Submission, Rework 1, Rework 2…) ✅
- Rework history panel shows all rework requests with full details ✅
- Technician mobile UI shows rework banner with Resume Work button ✅
- Original evidence is read-only during rework (delete buttons hidden for version 0) ✅
- New evidence appends during rework without overwriting originals ✅
- Audit log uses rework-specific actions (`rework_requested`, `rework_resumed`, `rework_completed`) ✅

### Sprint 5 — GPS & Field Operations — Complete ✅
*(unchanged — see v0.6.0 changelog for details)*

### Sprint 1–4 — Complete ✅
*(foundation, auth, core data models, time tracking, scheduling, field operations, offline)*

### Architecture Status

| Component | Status |
|---|---|
| Monorepo structure | ✅ Complete |
| Next.js frontend | ✅ Complete (13 routes) |
| Fastify API | ✅ Complete (health, auth, projects, time-entries, technicians, schedules, notes, attachments, signatures, reports, dashboard, rework) |
| PostgreSQL on Render | ✅ Connected, fully migrated (001-019) |
| Auth.js integration | ✅ Complete (JWT, credentials provider, roles, refresh tokens) |
| JWT auth middleware | ✅ Complete (Fastify, Socket.io, BFF proxy) |
| Socket.io real-time | ✅ Complete (clock, job, note, attachment, signature events) |
| Project CRUD API | ✅ Complete (create, read, update, status change) |
| Time tracking API | ✅ Complete (clock in, clock out, current, list, GPS, geofence) |
| Technician assignments API | ✅ Complete (assign, unassign, list) |
| Schedule API | ✅ Complete (CRUD, calendar, status transitions, my-jobs, multi-tech, rework) |
| Job Notes API | ✅ Complete (list, create, role-enforced, rework-versioned) |
| Attachments API | ✅ Complete (upload, serve, delete, GPS geotagging, max 20 per job, rework-versioned) |
| Signatures API | ✅ Complete (capture, serve, rework-versioned) |
| Rework API | ✅ Complete (create, list, resume, complete) |
| Audit logging | ✅ Complete (insert-only, status transitions, rework-specific actions) |
| Offline queue | ✅ Complete (IndexedDB, auto-sync, retry with backoff) |
| Office projects page | ✅ Complete (CRUD, assignments, status filter, live feed) |
| Office schedule page | ✅ Complete (calendar, forms, unassigned queue, review panel) |
| Office dashboard | ✅ Complete (summary cards, live feed, reports link) |
| Office reports page | ✅ Complete (time entries, by tech, by project, CSV export) |
| Office review page | ✅ Complete (checklist, rework requests, evidence grouped by revision) |
| Mobile clock-in/out | ✅ Complete (project selection, timer, one-tap actions, GPS, geofence) |
| Mobile time history | ✅ Complete (this week's entries with duration) |
| Mobile job queue | ✅ Complete (Today/Upcoming/Completed tabs) |
| Mobile job detail | ✅ Complete (info, stepper, workflow buttons, notes, photos, signatures, nav, contact, offline, rework) |
| Live status feed widget | ✅ Complete (real-time clock + job events on dashboard) |
| PWA configuration | ✅ Complete (manifest, viewport) |
| Auth sessions | ✅ Complete (refresh token rotation, 30-day persistence) |
| Deployment | ✅ Render.com live — API + PostgreSQL provisioned |
| Geo-migration runner | ✅ Custom `migrate.ts` reads DATABASE_URL from Render env, no dotenv dependency |

## Platform Status

| Platform | Status |
|---|---|
| Render.com account | ✅ Provisioned — API + PostgreSQL live |
| PostgreSQL database | ✅ Render PostgreSQL v16 — fully migrated (19 migrations) |
| Domain name | ❌ Not yet configured (onrender.com subdomain in use) |
| GitHub repository | ✅ Connected to Render (auto-deploy: false — manual push) |

## Current Blockers

- None

## Next Milestone

Sprint 6 — Customer Completion Report PDF

## Last Build

✅ All packages typecheck: `pnpm typecheck` — 4/4 passed
✅ All packages build: `pnpm build` — 4/4 successful
- @fieldconnect/shared: tsc — passed
- @fieldconnect/ui: tsc — passed
- @fieldconnect/api: tsc — passed
- @fieldconnect/web: Next.js 14.2.35 — passed (13 routes)
