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

## In Progress

### Sprint 2 — Core Data Models & Time Tracking
- Database schema migrations (projects, time_entries, technician_assignments) — partial (projects migrated)
- Project CRUD API endpoints
- Time tracking API (clock in/out, manual entry)
- Mobile clock-in/out UI (iPhone-optimized)
- Office dashboard — project list view
- Real-time clock event push via WebSocket

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
