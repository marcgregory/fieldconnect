# FieldConnect Roadmap

Last updated: 2026-07-07

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

## Sprint Queue

### Sprint 6 — Security & Account Hardening (🚧 In Progress)

**Goal:** Bring FieldConnect to production-grade account security.

#### Phase 1 — Email Infrastructure (Foundation)
- [ ] Email service abstraction
- [ ] Resend integration
- [ ] Email template system (Verify Email, Password Reset, Welcome, Login Alert)
- [ ] Environment variables for email config
- [ ] Queue-friendly email sender
- [ ] Local preview mode for development

#### Phase 2 — Email Verification
- [ ] `email_verified_at` column on users table
- [ ] `verification_tokens` table (hashed, expiring, single-use tokens)
- [ ] Send verification email on registration
- [ ] Verification link handler (verify token, set `email_verified_at`)
- [ ] "Pending Verification" state — logged in but restricted to verify/resend/change email
- [ ] Resend verification email (rate limited)
- [ ] Change email address flow
- [ ] Audit events for verification actions

#### Phase 3 — Forgot Password
- [ ] `password_reset_tokens` table (hashed, expiring, single-use tokens, used_at)
- [ ] Forgot password request → email with reset link
- [ ] Reset password page with new password form
- [ ] Password strength validation
- [ ] Invalidate all refresh tokens on password change
- [ ] Force re-login after reset
- [ ] Audit events for password resets

#### Phase 4 — Login Protection
- [ ] Rate limiting on: login, register, forgot password, reset password
- [ ] Temporary account lockout after N failed attempts
- [ ] Exponential backoff on lockout duration
- [ ] Generic login error messages (never reveal: email exists, wrong password, account missing)
- [ ] Audit events for failed logins and lockouts

#### Phase 5 — Session Security
- [ ] Extend refresh tokens with: device name, browser, last_used_at
- [ ] View active sessions in user profile
- [ ] Revoke single session
- [ ] Revoke all sessions
- [ ] Audit events for session revocation

#### Phase 6 — File Upload Security
- [ ] Validate MIME type (whitelist: jpg, jpeg, png, webp, pdf)
- [ ] Validate file extension
- [ ] Max file size enforcement
- [ ] Image dimension validation
- [ ] Reject executable and script uploads (exe, js, bat, cmd, php, svg)

#### Phase 7 — Security Headers & Server Hardening
- [ ] Helmet integration for Fastify
- [ ] Content Security Policy (CSP)
- [ ] HSTS
- [ ] X-Frame-Options
- [ ] Referrer Policy
- [ ] CORS tightening
- [ ] Request body size limits

#### Phase 8 — Audit & Monitoring
- [ ] Audit logging for: user login, failed login, password reset, email verification, role changes, session revoked, rework override, admin actions
- [ ] Audit log viewer (admin only, future sprint — table + schema only now)

**Definition of Done:**
- ✓ Email verification with pending state
- ✓ Forgot password with token rotation
- ✓ Session management (view + revoke)
- ✓ Rate limiting on all auth endpoints
- ✓ Login lockout with backoff
- ✓ Secure upload validation
- ✓ Security headers
- ✓ Audit logging for critical actions
- ✓ Sprint documentation updated

### Sprint 7 — Notifications (Socket + Push + Email)

- Real-time WebSocket notifications for:
  - Rework requested
  - New assignment
  - Schedule changed
  - Job cancelled
  - Job overdue
- In-app notification center (office + mobile)
- Push notifications via service worker
- Email notifications (configurable per user)
- SMS notifications (optional, future)

### Sprint 8 — Inventory / Materials

- Material catalog (types, SKUs, units, pricing)
- Job material usage tracking
- Technician material add/edit on mobile
- Office inventory overview
- Stock deduction on job completion
- Basic costing reports

### Sprint 9 — Customer Completion Report PDF

- Auto-generated PDF with all job evidence
- Cover page with company logo and project info
- Customer and project details
- Technician(s) name, dates, and signature
- Timeline overview
- Before/During/After photos embedded
- GPS proof (clock-in coordinates, distance from site, geofence status)
- Customer signature page
- Job notes included
- Rework history section
- Materials used section
- QR code linking back to the job
- PDF download link on office review page

### Sprint 10 — Analytics & Dashboards

- Charts and trend visualizations
- Job completion rates
- Technician productivity metrics
- Project profitability estimates
- Exportable reports (CSV, PDF)

### Sprint 11 — Customer Portal

- Customer-facing status page
- Job timeline view
- Photo gallery
- Document download

### Sprint 12 — Offline Improvements

- Enhanced offline queue resilience
- Conflict resolution UI
- Background sync improvements

### Sprint 13 — Route History (Optional)

- GPS Route History (Phase E — deferred, optional, expensive)

## Future

- Integration with existing tools data migration
- File storage migration to S3-compatible cloud
- Audit log viewer UI for admin

## Completed Milestone (Revision-Based Rework) ✅

Released alongside Sprint 5, ahead of the original Sprint 6 plan.

- `rework_required` status, `rework_requests` table, `rework_version` on evidence
- API: create/list/resume/complete rework requests
- Office: evidence grouped by revision, rework history panel
- Technician: rework banner, read-only originals, append new evidence
- Audit: `rework_requested`, `rework_resumed`, `rework_completed` actions

## Blocked

- Existing tool integration — requires inventory of current systems
