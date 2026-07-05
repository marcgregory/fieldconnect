# FieldConnect Roadmap

Last updated: 2026-07-05

## Completed

- Foundation documentation generated (PRD, scope, architecture, tech stack, deployment, ADRs)
- Technology stack approved by project owner
- **Sprint 1 — Foundation & Auth** ✅
  - Monorepo scaffolding (pnpm + Turborepo) — 4 packages build successfully
  - Next.js 14 app with App Router — 9 routes (/, /login, /register, /dashboard, /mobile, /unauthorized, /api/auth/[...nextauth], /api/health)
  - Fastify API with health check + auth endpoints
  - PostgreSQL schema migrations (users + projects tables)
  - Auth.js integration with JWT and role-based access (admin, office_manager, dispatcher, field_technician)
  - Login/register pages with client-side validation
  - Role-based routing: field techs → `/mobile`, office staff → `/dashboard`
  - Mobile-optimized PWA layout with iPhone viewport
  - Tailwind CSS with responsive design primitives
  - Shared packages: @fieldconnect/shared (types, validation), @fieldconnect/ui (components)
  - All packages pass `pnpm build`, `pnpm typecheck` with zero errors

## Completed

- **Sprint 2 — Core Data Models & Time Tracking** ✅
  - Database schema migrations (time_entries, technician_assignments) — full
  - Project CRUD API endpoints with Zod validation and role protection
  - Time tracking API (clock in, clock out, current status, filtered listing)
  - Technician assignment API (assign, unassign, list)
  - Mobile clock-in/out UI with project selection, 1-tap actions, running timer (HH:MM:SS)
  - Office projects page (CRUD, status management, technician assignments)
  - Live status feed widget (Socket.io real-time clock events on dashboard)
  - JWT auth middleware for Fastify with requireRole() guard
  - Socket.io WebSocket server with JWT-authenticated handshake
  - BFF proxy route for token forwarding
  - All packages pass `pnpm build` and `pnpm typecheck` (11 routes)

## Completed

- **Sprint 3 — Scheduling & Field Operations** ✅
  - Phase A: Office scheduling (calendar, drag-drop, forms, unassigned queue)
  - Phase B: Technician mobile workflow (job queue, job detail, nav, contact)
  - Phase C: Job status state machine (6-status lifecycle, audit logs, role enforcement)
  - Phase D1: Job notes (API, migration, mobile UI, real-time events)
  - Phase D2: Photo upload (multipart API, client-side compression, offline queue)
  - Phase D3: Customer signature (Canvas capture, API, offline queue)
  - Phase E: Real-time WebSocket events for all field data types
  - Phase F: Offline-first PWA (IndexedDB cache, action queue, auto-sync, retry)
  - Phase G: Shared types and Zod schemas for all new entities
  - Phase H: Frontend API client for all endpoints
  - Phase I: Route registration, office + mobile navigation
  - BFF proxy fixes (double prefix, empty body, auth exclusion)
  - All packages pass `pnpm typecheck` and `pnpm build` — 12 routes

## Sprint Queue

### Sprint 4 — Reporting & Analytics
- Time report generation API
- CSV export
- Dashboard summary widgets (hours this week, active techs, needs review count)
- Schedule conflict detection UI
- Technician performance summaries
- Automated billing data preparation

## Future

- GPS location stamping on clock-in
- Advanced reporting (PDF export, charts)
- Push notifications for schedule changes
- Audit log viewer UI for admin
- Integration with existing tools data migration
- File storage migration to S3-compatible cloud

## Blocked

- Existing tool integration — blocked until Sprint 4+; requires inventory of current systems
- Photo uploads — blocked until Sprint 5+; requires storage solution on Render
- Offline support — blocked until Sprint 5+; requires IndexedDB architecture design
