# FieldConnect Project Status

Last updated: 2026-07-06

This document is a snapshot. It is not a changelog.

## Current Sprint

Sprint 5 — GPS & Field Operations ✅ **Complete**

## Sprint 6 — Customer Completion Report PDF 🚧

## Current Progress

**Sprint 5 — Complete ✅**

All phases (A through D) verified via production smoke test on Render.

### Phase A: GPS Location Stamping — Complete ✅
- GPS coordinates captured at clock in/out ✅
- Customer site coordinates (latitude/longitude) on projects ✅
- Distance calculation (Haversine) from technician to site ✅
- Google Maps links for clock-in location ✅
- `geofence_radius` field on projects (default 50m) ✅

### Phase B: Soft Geofencing — Complete ✅
- Distance from site calculated on every clock in/out ✅
- Inside/Outside geofence badge on mobile ✅
- Office visibility of geofence status in review page ✅
- Polished clock-in location card (time, distance, accuracy, badge) ✅
- GPS accuracy stored in DB (±N meters from Geolocation API) ✅
- No enforcement — informational only ✅

### Phase C: Photo Geotagging — Complete ✅
- GPS metadata captured on uploaded photos ✅
- Distance from site computed per photo ✅
- EXIF + DB metadata stored ✅
- Office review shows photo GPS badges ✅

### Phase D: Configurable Geofence Enforcement — Complete ✅
- Per-project `geofence_radius` (configurable) ✅
- `geofence_action` field (`warning` / `block_clock_in` / `require_override`) ✅
- Warning on outside-geofence clock-in ✅
- Office override for blocked clock-ins ✅

### Multi-Technician Scheduling — Complete ✅
- `schedule_technicians` junction table ✅
- Conflict detection per technician (overlap + 30-min buffer) ✅
- Team assignment before scheduling ✅

### Persistent Auth Sessions — Complete ✅
- Refresh token rotation (30-day expiry) ✅
- `/api/v1/auth/refresh` endpoint ✅
- `/api/v1/auth/logout` with token revocation ✅

### Architecture Status

| Component | Status |
|---|---|
| Monorepo structure | ✅ Complete |
| Next.js frontend | ✅ Complete (13 routes) |
| Fastify API | ✅ Complete (health, auth, projects, time-entries, technicians, schedules, notes, attachments, signatures, reports, dashboard) |
| PostgreSQL on Render | ✅ Connected, migrated, verified |

## Architecture Status

| Component | Status |
|---|---|
| Monorepo structure | ✅ Complete |
| Next.js frontend | ✅ Complete (13 routes) |
| Fastify API | ✅ Complete (health, auth, projects, time-entries, technicians, schedules, notes, attachments, signatures, reports, dashboard) |
| PostgreSQL on Render | ✅ Connected, fully migrated (001-017) |
| Auth.js integration | ✅ Complete (JWT, credentials provider, roles, refresh tokens) |
| JWT auth middleware | ✅ Complete (Fastify, Socket.io, BFF proxy) |
| Socket.io real-time | ✅ Complete (clock, job, note, attachment, signature events) |
| Project CRUD API | ✅ Complete (create, read, update, status change) |
| Time tracking API | ✅ Complete (clock in, clock out, current, list, GPS, geofence) |
| Technician assignments API | ✅ Complete (assign, unassign, list) |
| Schedule API | ✅ Complete (CRUD, calendar, status transitions, my-jobs, multi-tech) |
| Job Notes API | ✅ Complete (list, create, role-enforced) |
| Attachments API | ✅ Complete (upload, serve, delete, GPS geotagging, max 20 per job) |
| Signatures API | ✅ Complete (capture, serve) |
| Audit logging | ✅ Complete (insert-only, status transitions) |
| Offline queue | ✅ Complete (IndexedDB, auto-sync, retry with backoff) |
| Office projects page | ✅ Complete (CRUD, assignments, status filter, live feed) |
| Office schedule page | ✅ Complete (calendar, forms, unassigned queue, review panel) |
| Office dashboard | ✅ Complete (summary cards, live feed, reports link) |
| Office reports page | ✅ Complete (time entries, by tech, by project, CSV export) |
| Mobile clock-in/out | ✅ Complete (project selection, timer, one-tap actions, GPS, geofence) |
| Mobile time history | ✅ Complete (this week's entries with duration) |
| Mobile job queue | ✅ Complete (Today/Upcoming/Completed tabs) |
| Mobile job detail | ✅ Complete (info, stepper, workflow buttons, notes, photos, signatures, nav, contact, offline) |
| Live status feed widget | ✅ Complete (real-time clock + job events on dashboard) |
| PWA configuration | ✅ Complete (manifest, viewport) |
| Auth sessions | ✅ Complete (refresh token rotation, 30-day persistence) |
| Deployment | ✅ Render.com live — API + PostgreSQL provisioned |
| Geo-migration runner | ✅ Custom `migrate.ts` reads DATABASE_URL from Render env, no dotenv dependency |

## Platform Status

| Platform | Status |
|---|---|
| Render.com account | ✅ Provisioned — API + PostgreSQL live |
| PostgreSQL database | ✅ Render PostgreSQL v16 — fully migrated (17 migrations) |
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
