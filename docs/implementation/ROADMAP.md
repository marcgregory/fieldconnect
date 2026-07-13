# FieldConnect Roadmap

Last updated: 2026-07-11

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

## Completed

- **Sprint 4 — Reporting & Analytics** ✅
  - Time entries report API with filters (project, technician, date range)
  - Hours by technician aggregation report
  - Hours by project aggregation report
  - Dashboard summary API (hours this week, active techs, completed today, needs review, late jobs)
  - CSV export for time entries
  - Dashboard summary cards widget on office dashboard
  - Reports page with tabbed view and date range picker
  - Full lifecycle smoke test — validates registration, login, project CRUD, time tracking, schedule workflow, job status transitions, field data (notes/photos/signatures), offline queue, reports, and CSV export
  - All packages pass `pnpm typecheck` and `pnpm build` — 13 routes

## Completed

- **Sprint 5 — GPS & Field Operations**
  - **Phase A — GPS Clock In/Out** ✅
    - GPS captured at clock in/out
    - Customer site coordinates
    - Distance calculation
    - Google Maps links

## Completed

- **Sprint 5 — GPS & Field Operations** ✅
  - **Phase A — GPS Clock In/Out** ✅ — GPS coordinates captured at clock in/out, customer site coordinates, distance calculation (Haversine), Google Maps links
  - **Phase B — Soft Geofencing** ✅ — Distance from site, Inside/Outside badge, office visibility, no blocking
  - **Phase C — Photo Geotagging** ✅ — GPS on uploaded photos, distance from site, EXIF + DB metadata, review integration
  - **Phase D — Configurable Geofence Enforcement** ✅ — Per-project radius, warning or block (configurable), office override
  - **Multi-technician scheduling** ✅ — schedule_technicians junction table, conflict detection, team assignment
  - **Persistent auth sessions** ✅ — Refresh token rotation, 30-day sessions, device tracking
  - **Geo-action enforcement** ✅ — geofence_action field (warning / block_clock_in / require_override)

## Completed

- **Sprint 6 — Security & Account Hardening** ✅
  - **Phase 1 — Email Infrastructure** ✅ — `EmailProvider` abstraction, `ResendProvider`, `PreviewProvider` (writes `.emails/*.html` + console mode), `getEmailService()` lazy singleton, four inline HTML + plain-text templates (Verify Email, Password Reset, Invitation, Welcome), HTML escaping on every user-supplied value
  - **Phase 2 — Email Verification** ✅ — `users.email_verified_at` column, `verification_tokens` table (SHA-256 hash, 24h TTL, single active token), `auth_audit_logs` table (auth events with `user_id` nullable), `rate_limit_events` table (atomic check-and-increment), `GET /api/v1/auth/verify-email` and `POST /api/v1/auth/resend-verification` (1/min + 5/hr windows, generic 200 to prevent enumeration), login blocks unverified users with 403 `EMAIL_NOT_VERIFIED`, refresh route revokes tokens for unverified users, web `/verify-email` and `/verify-email/result` pages with 60s client cooldown
  - **Form Architecture — react-hook-form + zod** ✅ — shadcn-style `<Form>`, `<FormField>`, `<FormItem>`, `<FormLabel>`, `<FormControl>`, `<FormDescription>`, `<FormMessage>` in `@fieldconnect/ui` (built on `react-hook-form` + `@hookform/resolvers/zod`), `mapApiErrorToFormError` central server-error parser, auth forms (`login`, `register`, `verify-email`) and `ProjectForm` migrated; `ScheduleForm`/`ClockInOut`/`JobDetailClient` deferred to TD-008 (Sprint 7)
  - **Phase 4 — Login Protection** ✅ — Per-IP rate limit, account lockout, timing-safe bcrypt
  - **Phase 3 — Forgot Password / Reset Password** ✅ — Complete password reset flow with email
  - **Phase 5 — Session Security** ✅ — Refresh token rotation with reuse detection, `sessions` table (list/revoke/logout-all), JWT hardening (issuer/audience/15min TTL), trusted proxy secret + `net.isIP()`, password reset revokes all sessions, web `/sessions` page, 7 new audit events
  - **Phase 7 — Security Headers** ✅ — Fastify `onSend` hook sets 8 security headers (X-Content-Type-Options, Referrer-Policy, Permissions-Policy, Cross-Origin-Resource-Policy, Cross-Origin-Opener-Policy, Origin-Agent-Cluster, X-DNS-Prefetch-Control, HSTS in production), Next.js `next.config.js` `async headers()` sets full CSP and same headers on frontend HTML pages, X-Powered-By removed, CORS reviewed and confirmed (no wildcard, credentials only with explicit origin), CSP exception documented (Next.js 14 inline styles = `style-src 'unsafe-inline'`, tracked TD-009)
- **TD-009 — Periodic Cleanup Script** ✅ — Idempotent cleanup for 7 expiring tables with bounded batch deletes, dry-run mode, Render Cron Job compatible
- **Sprint 6 Cleanup — Audit Monitoring UI** ✅ — Admin-only audit event viewer with pagination, filtering, action badges, and summary
- **Sprint 7 — Customer Completion Report PDF** ✅ — PDFKit-based A4 completion report with project info, time summary, notes, photos, and signatures
