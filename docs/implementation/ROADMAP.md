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

## Sprint Queue

### Sprint 3 — Scheduling & Reporting
- Schedule management API
- Calendar view for dispatcher
- Technician schedule view (mobile)
- Time report generation
- CSV export
- Dashboard widgets and summaries

## Future

- Photo attachment to time entries
- Offline time entry queue (IndexedDB + sync on reconnect)
- GPS location stamping on clock-in
- Advanced reporting (PDF export, charts)
- Push notifications for schedule changes
- Audit logs for admin
- Technician performance dashboards
- Integration with existing tools data migration
- Automated billing data export

## Blocked

- Existing tool integration — blocked until Sprint 4+; requires inventory of current systems
- Photo uploads — blocked until Sprint 5+; requires storage solution on Render
- Offline support — blocked until Sprint 5+; requires IndexedDB architecture design
