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

- **Sprint 6 — Security & Account Hardening** 🚧 (in progress)
  - **Phase 1 — Email Infrastructure** ✅ — `EmailProvider` abstraction, `ResendProvider`, `PreviewProvider` (writes `.emails/*.html` + console mode), `getEmailService()` lazy singleton, four inline HTML + plain-text templates (Verify Email, Password Reset, Invitation, Welcome), HTML escaping on every user-supplied value
  - **Phase 2 — Email Verification** ✅ — `users.email_verified_at` column, `verification_tokens` table (SHA-256 hash, 24h TTL, single active token), `auth_audit_logs` table (auth events with `user_id` nullable), `rate_limit_events` table (atomic check-and-increment), `GET /api/v1/auth/verify-email` and `POST /api/v1/auth/resend-verification` (1/min + 5/hr windows, generic 200 to prevent enumeration), login blocks unverified users with 403 `EMAIL_NOT_VERIFIED`, refresh route revokes tokens for unverified users, web `/verify-email` and `/verify-email/result` pages with 60s client cooldown
  - **Form Architecture — react-hook-form + zod** ✅ — shadcn-style `<Form>`, `<FormField>`, `<FormItem>`, `<FormLabel>`, `<FormControl>`, `<FormDescription>`, `<FormMessage>` in `@fieldconnect/ui` (built on `react-hook-form` + `@hookform/resolvers/zod`), `mapApiErrorToFormError` central server-error parser, auth forms (`login`, `register`, `verify-email`) and `ProjectForm` migrated; `ScheduleForm`/`ClockInOut`/`JobDetailClient` deferred to TD-008 (Sprint 7)
  - **Phase 4 — Login Protection** ✅ — Per-IP rate limit (10/5min per IP via `rate_limit_events`), per-account lockout (5 failures → 15 min via `login_lockouts` table), timing-safe bcrypt (same duration for unknown email and wrong password), `trustProxy` enabled for Render, frontend Retry-After countdown, 6 new audit actions (`login_failed` / `login_rate_limited` / `account_temporarily_locked` / `login_blocked_locked` / `login_success` / `lockout_cleared`)
  - **Phase 3 — Forgot Password / Reset Password** ✅ — `password_reset_tokens` table (SHA-256 hash, 1h TTL, single active token, mirrors `verification_tokens`), `passwordResetRoutes` with `GET /:token` (read-only peek), `POST /forgot-password` (rate-limited 1/5min + 5/hr, generic 200), `POST /reset-password` (transactional: hash + update password, mark token used, revoke all refresh tokens, notification email), `password-changed` email template added, `AuthAuditAction` extended with `password_reset_requested` / `password_reset_completed` / `password_reset_failed`, web `/forgot-password` page (RHF, 60s cooldown, generic success banner, email pre-fill from query param), web `/reset-password/[token]` page (mount-time GET peek for form/expired/used/invalid states, RHF with password + confirm fields, success/error states), "Forgot password?" link on `/login`, all `pnpm typecheck` / `pnpm build` / `pnpm lint` pass

## Sprint Queue

### Sprint 6 — Security & Account Hardening (🚧 In Progress)

**Goal:** Bring FieldConnect to production-grade account security.

#### Phase 1 — Email Infrastructure (Foundation) ✅
- [x] Email service abstraction
- [x] Resend integration
- [x] Email template system (Verify Email, Password Reset, Invitation, Welcome)
- [x] Environment variables for email config
- [x] Queue-friendly email sender (lazy provider, no in-memory queue yet)
- [x] Local preview mode for development (writes `.emails/*.html`)

#### Phase 2 — Email Verification ✅
- [x] `email_verified_at` column on users table
- [x] `verification_tokens` table (hashed, expiring, single-use tokens)
- [x] Send verification email on registration
- [x] Verification link handler (verify token, set `email_verified_at`)
- [x] "Pending Verification" state — block login with 403, resend allowed
- [x] Resend verification email (rate limited)
- [ ] Change email address flow (deferred to Phase 2.5 / Sprint 7)
- [x] Audit events for verification actions

#### Phase 3 — Forgot Password ✅
- [x] `password_reset_tokens` table (hashed, 1h TTL, single-use tokens, used_at, 3 indexes)
- [x] Forgot password request → email with reset link (always 200, rate limited)
- [x] Reset password page with new password form (RHF + Zod, confirm password)
- [x] Password strength validation (min 8 chars, confirm match)
- [x] Invalidate all refresh tokens on password change
- [x] Force re-login after reset (all sessions revoked)
- [x] Audit events for password resets (requested / completed / failed)
- [x] Password-changed notification email

#### Phase 4 — Login Protection ✅
- [x] Per-IP rate limit on login (10 attempts per 5 min, rate_limit_events table)
- [x] Per-account lockout after 5 consecutive failed attempts (15 min, login_lockouts table)
- [x] Server-side backoff deferred (per-IP + account lockout sufficient; added as a doc item for v2)
- [x] Generic login error messages (same 401 for unknown email and wrong password; timing-safe bcrypt)
- [x] Audit events: login_failed, login_rate_limited, account_temporarily_locked, login_blocked_locked, login_success

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
