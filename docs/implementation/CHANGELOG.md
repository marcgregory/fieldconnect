# Changelog

All notable project changes should be documented here. Keep this file versioned and historical; do not use it as a current status report.

## v0.11.0 — 2026-07-11

### Added

- **Sprint 6 / Phase 4 — Login Protection** ✅
  - Per-IP rate limit on `POST /api/v1/auth/login` (10 failed attempts per 5 minutes per client IP, reuses `rate_limit_events` table)
  - Per-account lockout after 5 consecutive failed attempts on the same email (15-minute lockout via new `login_lockouts` table)
  - Timing-safe bcrypt comparison — when the email doesn't exist, the submitted password is compared against a pre-computed dummy hash so the "unknown email" and "wrong password" paths take the same duration
  - `trustProxy: true` enabled on the Fastify instance so `request.ip` resolves the real client IP behind Render's proxy
  - IPv6/IPv4 normalization in IP scope keys (strips `::ffff:` prefix)
  - Frontend Retry-After countdown — on `RATE_LIMITED` or `ACCOUNT_LOCKED` 429 responses, the submit button shows a countdown and is disabled until the window expires
  - `login-attempts.ts` query module — `checkIpLimit()`, `checkLockout()`, `recordFailure()`, `recordSuccess()`, `clearExpiredLockouts()`
  - New audit events: `login_failed`, `login_rate_limited`, `account_temporarily_locked`, `login_blocked_locked`, `login_success`
  - `ACCOUNT_LOCKED` and `RATE_LIMITED` handled in `mapApiErrorToFormError` with `retryAfter` metadata

### Security

- Generic 401 response for both unknown email and wrong password (no enumeration)
- Timing-safe login path — always runs bcrypt.compare, even for non-existent accounts
- IP rate limit is charged before body parsing (wasted CPU for over-limit requests)
- Unverified-email attempts do NOT count toward the lockout threshold
- Schema validation errors do NOT consume rate-limit slots
- Stale lockout rows are cleaned up inline on every lockout check

### Migration

- Apply `030_create-login-lockouts.sql` via `pnpm db:migrate`

## v0.10.0 — 2026-07-11

### Added

- **Sprint 6 / Phase 3 — Forgot Password / Reset Password** ✅
  - `password_reset_tokens` table (migration `029_create-password-reset-tokens.sql`) — SHA-256 hashed tokens, 1h TTL, single-active per user, mirrors `verification_tokens` structurally
  - `GET /api/v1/auth/reset-password/:token` — read-only token peek (validates without consuming), returns `{ valid: true }` or `{ valid: false, reason: 'expired' | 'used' | 'invalid' }`
  - `POST /api/v1/auth/forgot-password` — two rate-limit windows (300s × 1, 3600s × 5, per-email), generic 200 to prevent email enumeration, fire-and-forget email dispatch
  - `POST /api/v1/auth/reset-password` — atomic transaction: bcrypt-hash new password, `UPDATE users.password_hash`, `markUsed()`, `revokeAllForUser()` (all refresh tokens revoked, user must re-login everywhere)
  - `db/queries/password-reset-tokens.ts` — `create()`, `invalidateAllForUser()`, `peek()`, `consume()`, `markUsed()`
  - `db/queries/users.ts` — new `setPasswordHash(id, hash)` function
  - `services/password-reset.ts` — `sendPasswordResetEmail`, `sendPasswordResetEmailFireAndForget`, `sendPasswordChangedEmailFireAndForget`, `buildResetUrl`
  - `'password-changed'` email category added to `EmailCategory` union
  - `renderPasswordChanged()` template — notifies user after a successful reset ("If this wasn't you, contact your PM immediately")
  - `resetPasswordSchema` extended to include `token` field; `resetPasswordFormSchema` added for client-side confirm-password validation
  - Auth middleware skip-list extended with `/api/v1/auth/forgot-password` and `/api/v1/auth/reset-password`
  - Auth audit action union extended: `password_reset_requested`, `password_reset_completed`, `password_reset_failed`, `password_changed_notification_sent`
  - Web `/forgot-password` page — RHF + zod, single email field, 60s client cooldown, generic success banner, email pre-fill from `?email=` query param
  - Web `/reset-password/[token]` page — mount-time GET peek for form/expired/used/invalid states, RHF with password + confirm-password fields
  - Web `/login` — "Forgot password?" link routes to `/forgot-password?email=<current input>`
  - All `pnpm typecheck`, `pnpm build`, `pnpm lint` pass (4/4 tasks each)

### Security

- Password reset tokens never stored in plaintext (SHA-256 hash on insert)
- `forgot-password` always returns 200 to prevent email enumeration
- Two independent rate-limit windows on forgot-password (5 min × 1, 1 hour × 5) — stricter than resend-verification because password reset is more sensitive
- Single-active token enforcement — issuing a new token invalidates all prior active ones
- On successful reset, all refresh tokens across all devices are revoked immediately
- Password-changed email sent to the user so they know if it wasn't them who initiated the reset

### Migration

- Apply `029_create-password-reset-tokens.sql` via `pnpm db:migrate` (no data migration — new table only)

## v0.9.0 — 2026-07-11

### Added

- **Sprint 6 / Phase 2 — Email Verification** ✅
  - `users.email_verified_at TIMESTAMPTZ NULL` column (migration `025_add-email-verified-at.sql`)
  - `verification_tokens` table — SHA-256-hashed tokens, 24h TTL, single active token per user (invalidated on resend via `used_at = NOW()`)
  - `auth_audit_logs` table — auth events keyed by nullable `user_id` (`ON DELETE SET NULL` so audit rows survive user deletion)
  - `rate_limit_events` table — atomic `INSERT ... ON CONFLICT DO UPDATE` window-based rate limiting, reusable by Sprint 6 Phase 4
  - `GET /api/v1/auth/verify-email?token=...` — consumes token, marks `email_verified_at = NOW()` and `used_at = NOW()` in a single transaction, writes `email_verified` to audit
  - `POST /api/v1/auth/resend-verification` — two rate-limit windows (60s × 1, 3600s × 5), generic 200 to prevent email enumeration
  - `email-verification` service façade — `sendVerificationEmail`, `sendVerificationEmailFireAndForget`, `buildVerifyUrl`
  - `register.ts` dispatches verification email after user creation (failures logged, not surfaced)
  - `login.ts` blocks unverified users with 403 `{ code: 'EMAIL_NOT_VERIFIED', canResend: true }`
  - `refresh.ts` revokes tokens for unverified users (handles pre-Phase-2 tokens cleanly)
  - `middleware/auth.ts` skip-list now includes `/api/v1/auth/verify-email` and `/api/v1/auth/resend-verification`
  - Web `/verify-email` page — "check your email" with 60s client cooldown
  - Web `/verify-email/result` page — four states (success / used / expired / invalid)
  - Web `/register` now routes to `/verify-email?email=…` instead of `/login`
  - Web `/login` surfaces 403 `EMAIL_NOT_VERIFIED` banner with a resend-verification link

- **Sprint 6 / Form Architecture — react-hook-form + zod** ✅
  - shadcn-style `<Form>`, `<FormField>`, `<FormItem>`, `<FormLabel>`, `<FormControl>`, `<FormDescription>`, `<FormMessage>`, `useFormField` in `@fieldconnect/ui`, built on `react-hook-form` + `@hookform/resolvers/zod`
  - All Form primitives wired for accessibility (`htmlFor`/`id` linkage, `aria-invalid`, `aria-describedby`)
  - `Form` typed as a generic over field values so `useForm<T>()` types flow through the provider
  - `cn()` helper in `packages/ui/src/lib/cn.ts` (no clsx/tailwind-merge dependency)
  - `mapApiErrorToFormError` / `mapApiResponseToFormError` in `apps/web/src/lib/map-api-error.ts` — central parser for Fastify error replies; handles `EMAIL_NOT_VERIFIED`, `RATE_LIMITED`, `EMAIL_ALREADY_EXISTS`, `INVALID_CREDENTIALS`, `NETWORK`, and a safe generic fallback (never leaks stack traces or SQL errors)
  - Auth forms migrated to RHF: `/login`, `/register`, `/verify-email` (resend button)
  - `ProjectForm` migrated — 7 useStates collapsed into a single `useForm` with `zodResolver(createProjectSchema)`
  - `loginSchema` password minimum relaxed to "required" (login must accept legacy accounts that pre-date the 8-character rule); `registerSchema` password minimum raised to 8 chars
  - `PASSWORD_MIN = 8` constant in `@fieldconnect/shared`
  - Phase 3 schemas added (no pages this turn): `forgotPasswordSchema`, `resetPasswordSchema`, `changePasswordSchema` (with current/new-must-differ refine)
  - `react-hook-form ^7.51.0` and `@hookform/resolvers ^3.9.0` added to `apps/web/package.json`; both added as peer dependencies on `@fieldconnect/ui`

### Technical Debt

- **TD-008** — Hand-rolled forms in `ScheduleForm` (470 lines), `ClockInOut` (559 lines), `JobDetailClient` (1645 lines) still need migration to react-hook-form + zod. Planned for Sprint 7.

### Security

- Verification tokens never stored in plaintext (SHA-256 hash on insert)
- `resend-verification` always returns 200 to prevent email enumeration, regardless of whether the user exists or is already verified
- Two independent rate-limit windows (60s × 1, 3600s × 5) on resend — over-limit attempt increments the row but returns 429

### Migration

- Apply `025_add-email-verified-at.sql`, `026_create-verification-tokens.sql`, `027_create-auth-audit-logs.sql`, `028_create-rate-limit-events.sql` via `pnpm db:migrate`.
- Existing users get `email_verified_at = NULL`; they must verify on next sign-in.
- No frontend-only migration step.

## v0.8.0 — 2026-07-11

### Added

- **Sprint 6 / Phase 1 — Email Infrastructure** ✅
  - `EmailProvider` abstraction in `apps/api/src/lib/email/provider.ts` with `EmailMessage`, `SendResult`, and a stable `EmailCategory` union (`verify-email` | `password-reset` | `invitation` | `welcome`)
  - `ResendProvider` (`resend-provider.ts`) — uses the official `resend` SDK; reads `RESEND_API_KEY` / `EMAIL_FROM` / `APP_URL` lazily and yields a clear runtime error if any are missing at send time
  - `PreviewProvider` (`preview-provider.ts`) — two modes: `preview` writes rendered HTML to `.emails/{timestamp}-{category}.html`; `console` logs only (useful for CI). Never throws on file-write failure.
  - `getEmailService()` lazy singleton in `config.ts` — provider instance is created on first call and cached
  - `assertEmailConfigValid()` — call once at boot to reject unknown `EMAIL_PROVIDER` values and to forbid `preview` mode in production
  - `getEmailServiceStatus()` — internal helper exposing `{ provider, configured, previewMode }` without leaking secrets
  - Four inline HTML + plain-text templates (`templates.ts`) with a shared `wrap()` layout and a single `renderTemplate(category, props)` entry point:
    - **Verify Email** — `{ name, verifyUrl }`
    - **Password Reset** — `{ name, resetUrl, expiresInMinutes }`
    - **Invitation** — `{ name, invitedBy, acceptUrl, role }`
    - **Welcome** — `{ name, loginUrl }`
  - All template output is HTML-escaped at render time (no XSS via user-supplied names)
  - Plain-text versions are stripped, human-readable renderings — no Markdown, no extra tooling
  - `resend ^6.17.2` added to `apps/api/package.json`
  - New env vars (placeholders in `.env` and `.env.example`): `EMAIL_PROVIDER`, `EMAIL_FROM`, `APP_URL`, `RESEND_API_KEY`
  - `.emails/` added to `.gitignore`

### Security

- Dev preview files never include recipient address, token, or user data in filenames
- HTML escaping applied to every user-supplied value in templates (name, invitedBy, role, URLs)
- Plain-text body for password-reset explicitly tells users to ignore the email if they didn't request it
- Production boot refuses to start in `preview` mode

### Changed

- Dev default for `EMAIL_PROVIDER` is `preview`; production must set it explicitly to `resend` or `console`

### Migration

None. No schema changes, no new endpoints, no frontend changes. This phase is the foundation for the rest of Sprint 6.

## v0.7.0 — 2026-07-07

### Added

- **Revision-Based Rework (overhauls the rework workflow)**
  - New `rework_required` job status and `rework_requests` table for formal rework tracking
  - `rework_version` column on `job_notes`, `job_attachments`, and `signatures` to group evidence by revision cycle (0 = original submission)
  - POST `/api/v1/schedules/:id/rework` — create rework request + transition to `rework_required` (does not delete or overwrite existing evidence)
  - GET `/api/v1/schedules/:id/rework` — list rework requests per schedule
  - PATCH `/api/v1/schedules/:id/rework/:rid/resume` — technician resumes work on a rework request
  - PATCH `/api/v1/schedules/:id/rework/:rid/complete` — technician completes rework, schedule goes back to `completed`
  - All field data (notes, attachments, signatures) auto-assigns the correct `rework_version` when uploaded during an active rework
  - Office Review page groups evidence by rework version: **Original Submission** and **Rework N** sections
  - Rework history panel shows all rework requests with reason, requester, status, and timestamps
  - Technician mobile UI shows prominent "⚠ Rework Required" banner with Resume Work button
  - Original evidence is read-only during rework (delete buttons hidden for version 0 items)
  - Additional photos, notes, and signatures can be appended during rework without overwriting originals
  - Audit log uses specific actions: `rework_requested`, `rework_resumed`, `rework_completed`

### Changed

- **Status transition rules**: `completed → rework_required` and `rework_required → on_site/completed/closed`
- **Office staff role**: Can now advance jobs from both `completed` and `rework_required`
- **Technician role**: Can now advance jobs from `scheduled`, `traveling`, `on_site`, or `rework_required`
- **Review queue**: Now shows both `completed` and `rework_required` schedules
- **Evidence queries**: `create` functions in job-notes, job-attachments, and signatures accept optional `rework_version` parameter

### Migration

- Run `pnpm db:migrate` to apply migrations 018 (create rework_requests table) and 019 (add rework_version columns)
- Existing evidence gets `rework_version = 0` (original submission) — fully backward compatible

## v0.6.0 — 2026-07-06

### Added

- **Sprint 5 — GPS & Field Operations** ✅
  - **Phase A — GPS Location Stamping**: GPS coordinates at clock in/out, customer site coords, Haversine distance calculation, Google Maps links, `geofence_radius` field
  - **Phase B — Soft Geofencing**: Geofence status on every clock in/out, Inside/Outside badge on mobile, office geofence visibility in review, GPS accuracy (±N m) stored
  - **Phase C — Photo Geotagging**: GPS metadata on uploaded photos, distance from site, EXIF + DB metadata, office review photo GPS badges
  - **Phase D — Configurable Geofence Enforcement**: Per-project `geofence_radius`, `geofence_action` field (`warning` / `block_clock_in` / `require_override`), warning on outside-geofence clock-in, office override
- **Multi-Technician Scheduling**: `schedule_technicians` junction table, conflict detection (overlap + 30-min buffer), team assignment before scheduling
- **Persistent Auth Sessions**: Refresh token rotation (30-day), `/api/v1/auth/refresh`, `/api/v1/auth/logout` with token revocation
- **Production migration runner**: Custom `migrate.ts` reads `DATABASE_URL` from Render env directly — no dotenv dependency, no timestamp-format requirement
- **Restorative migration 017**: Idempotent catch-up that creates `schedule_technicians` and handles missing migrations gracefully

### Changed

- **render.yaml**: `startCommand` uses new `migrate.js` runner instead of `pnpm db:migrate` for reliable production migration
- **Schedule API**: Now accepts `technician_ids[]` for multi-technician scheduling alongside legacy single-tech support
- **Auth API**: Login returns `refresh_token` instead of JWT; client must exchange via `/auth/refresh` for JWT (access token)

### Fixed

- **Production migration gap**: Migrations 014–016 never applied on Render due to `node-pg-migrate` NNN_ naming issue and `.env` override of `DATABASE_URL`
- **Schedule endpoint 500**: `relation "schedule_technicians" does not exist` resolved by restorative migration 017

## v0.5.2 — 2026-07-06

### Added

- **Soft Geofencing (Phase B)**: Geofence status computed on every clock in/out — distance from technician GPS to project site coordinates compared against configurable `geofence_radius`.
- **Mobile geofence badge**: Clock-in UI now shows 🟢 Inside Geofence or 🟠 Outside Geofence alongside distance from customer site.
- **Office geofence visibility**: Review page shows a polished clock-in location card with time, distance, inside/outside badge, GPS accuracy (±N m), Google Maps links for clock-in location and customer site.
- **GPS accuracy capture**: `clock_in_accuracy` and `clock_out_accuracy` fields added to `time_entries` table (migration 012). Geolocation API accuracy is stored with every clock in/out.
- **Shared types**: `GeofenceStatus` type and `calculateDistance()` utility exported from `@fieldconnect/shared`.
- **Schedule queries**: `findAll`, `findByDateRange`, `findByTechnician`, `findUnassigned` now return `project_latitude`, `project_longitude`, and `project_geofence_radius`.
- **Clock-in API response**: Returns `distance_from_site` and `inside_geofence` fields alongside time entry data.
- **Clock-in project filter**: Only active/on-hold projects shown on Clock In screen — completed/cancelled projects are hidden.
- **Closed job read-only mode**: Mobile job detail now shows a green read-only banner for closed jobs, hides all editing controls (status transitions, note input, photo upload, signature capture, delete buttons).

### Changed

- **Navigation URLs**: Job detail navigation now uses stored `project_latitude`/`project_longitude` coordinates when available, falling back to address string — eliminates address ambiguity.
- **Review geofence card**: Redesigned with structured layout showing clock-in time, distance, inside/outside badge, accuracy, and separate Google Maps links for clock-in location and customer site.

## v0.5.1 — 2026-07-06

### Added

- **Full lifecycle smoke test**: `scripts/smoke-test.sh` — validates the entire user journey end-to-end: registration, login, project CRUD, time tracking, schedule workflow, job status transitions, field notes/photos/signatures, offline queue, reports, and CSV export

## v0.5.0 — 2026-07-06

### Changed

- **Simplified status workflow**: removed `office_review` from the state machine. New flow: `scheduled → traveling → on_site → completed → closed`. The Review page reads `status = 'completed'` which is now the single source of truth for work pending review.
- **DB migration 007**: converts all existing `office_review` records to `completed` and tightens the CHECK constraint.

### Fixed

- **Status mismatch bug**: Technician app was still writing `office_review` after the workflow was simplified. The Review page only queried `status = 'completed'`, so completed jobs disappeared from the review queue. Removed `office_review` from shared types, API validation rules, DB constraint, and all UI components (mobile + office).

## v0.1.0 — 2026-07-05

### Added

- Foundation documentation: PRD, project scope, architecture, tech stack, deployment strategy
- Monorepo structure with pnpm + Turborepo
- Next.js frontend app with App Router and route groups (office + mobile)
- Fastify API backend skeleton with health check
- PostgreSQL database schema for auth (users table, projects table)
- Auth.js integration for authentication and role-based access control
- Tailwind CSS with responsive primitives for mobile-first design
- Shared types package (@fieldconnect/shared) with TypeScript interfaces and Zod validation
- Shared UI component library (@fieldconnect/ui) with Button, Card, Input, Spinner
- ADRs for key decisions (no ORM, PostgreSQL on Render, PWA over native)
- Register and login pages with role selection
- Role-based routing: field technicians → `/mobile`, office staff → `/dashboard`
- Mobile-optimized home page with iPhone viewport (430px max-width)
- Protected dashboard with session-aware content
- Fastify API with health endpoints (`/api/v1/health`, `/api/v1/health/db`)
- Auth API endpoints (`POST /api/v1/auth/login`, `POST /api/v1/auth/register`)
- Database migration system via `node-pg-migrate`
- PWA manifest with icons for add-to-home-screen
- Unauthorized page for role-restricted routes
- `.env.example` with all required environment variables
- Project roadmap with 3 sprint horizon
- Sprint 1 build plan with full task breakdown

### Changed

(N/A — initial foundation)

### Fixed

(N/A — initial foundation)

### Removed

(N/A — initial foundation)

## v0.2.0 — 2026-07-05

### Added

- **Database migrations**: `time_entries` table (clock in/out, break tracking, notes) and `technician_assignments` table (many-to-many project-user links)
- **Auth middleware**: JWT verification via `jose` with `NEXTAUTH_SECRET`, `requireRole()` route guard for role-based access control
- **Socket.io WebSocket server**: attached to Fastify HTTP server, JWT-authenticated handshake, `tech:status` room for real-time clock event broadcast
- **Projects CRUD API**: `GET/POST /api/v1/projects`, `GET/PUT /api/v1/projects/:id`, `PATCH /api/v1/projects/:id/status` — all Zod-validated and role-protected
- **Time tracking API**: `POST /api/v1/time-entries/clock-in`, `POST /api/v1/time-entries/clock-out`, `GET /api/v1/time-entries/current`, `GET /api/v1/time-entries` — with active-entry conflict detection and duration calculation
- **Technician assignment API**: `POST/DELETE /api/v1/projects/:id/assign/:userId`, `GET /api/v1/projects/:id/assignments`, `GET /api/v1/technicians/assignments`, `GET /api/v1/technicians/available`
- **BFF proxy route**: `/api/proxy/[...path]` in Next.js forwards requests to Fastify with auto-signed JWT tokens
- **Shared types and validation**: `Project`, `TimeEntry`, `ActiveTimeEntry`, `TechnicianAssignment`, `ClockEvent` types; `createProjectSchema`, `updateProjectSchema`, `updateProjectStatusSchema`, `clockInSchema`, `clockOutSchema`, `assignTechnicianSchema` validation schemas
- **Office projects page**: `/(office)/projects/` with full CRUD, status management, technician assignment, status filter tabs
- **Live status feed widget**: Socket.io-powered real-time clock event feed on dashboard and projects page
- **Mobile clock-in/out UI**: project selection, one-tap clock in, live HH:MM:SS timer, confirm clock out, duration summary
- **Mobile time history**: this week's time entries with project name, duration, and details
- **Dashboard navigation**: Projects link, live feed integration, system status reflects active time tracking
- **Office route group**: `/(office)/layout.tsx` with role-based access (blocks field_technician)

### Changed

- Updated `DashboardClient` with real-time feed and projects navigation
- Updated `MobileHomeClient` with functional clock-in/out and time history
- Updated `MobilePage` to pass user data to client components

### Fixed

- (none)

## v0.3.0 — 2026-07-05

### Added

- **Job status state machine**: `PATCH /api/v1/schedules/:id/status` with transaction-safe status transitions, row-level locking, and role enforcement
- **audit_logs table migration**: `005_create-audit-logs.sql` — insert-only history for every status transition (schedule_id, user_id, old_status, new_status, metadata)
- **Status transition validation**: strict rules — technician advances own jobs `scheduled → traveling → on_site → completed`, office advances `completed → office_review → closed`, admin can correct any status
- **WebSocket job events**: `broadcastJobEvent()` emits `job:update` to `tech:status` room on every status change
- **Workflow buttons on mobile job detail**: "Start Traveling", "Arrived On Site", "Mark Complete" with confirmation dialog, refetch after status change
- **ScheduleReviewPanel component**: Office-side review controls — "Move to Office Review" and "Close Job" buttons with optional notes
- **Socket.io hook update**: `useSocket` now subscribes to `job:update` events alongside `tech:status`
- **Shared types**: `AuditLog`, `AuditLogWithUser`, `JobEvent` interfaces; `updateScheduleStatusSchema` Zod validation

### Changed

- `JobDetailClient` — added workflow progression buttons with loading states and confirmation overlay
- `useSocket` — added `lastJobEvent` and `jobEvents` to returned interface
- `ScheduleWithDetails` query — `findById` returns full enriched schedule including project contact info

### Fixed

- (none)

## v0.4.0 — 2026-07-05

### Added

- **Phase D1 — Job Notes**: `job_notes` table migration, API endpoints (list, create), mobile note input with offline queue, real-time `note:added` WebSocket events
- **Phase D2 — Photo Upload**: `job_attachments` table migration, multipart upload API, client-side image compression (Canvas API, 1200px max, JPEG 0.7 quality), offline photo queue with IndexedDB blob storage, `attachment:update` WebSocket events
- **Phase D3 — Customer Signature**: `signatures` table migration, base64 PNG capture API, `SignatureCanvas` Canvas drawing component, offline queue, `signature:captured` WebSocket events
- **Phase E — Real-Time Updates**: Full WebSocket event coverage — `broadcastNoteEvent()`, `broadcastAttachmentEvent()`, `broadcastSignatureEvent()` for all field data types
- **Phase F — Offline-First PWA**: IndexedDB wrapper (`db.ts`) with jobs cache, action queue, blob store; `useOfflineSync` hook with auto-sync on reconnect; `OfflineIndicator` component; connectivity probe; FIFO queue with 3-retry limit
- **Phase G — Shared Types & Validation**: `JobNote`, `JobAttachment`, `Signature`, `AuditLog`, `JobEvent`, `NoteEvent`, `AttachmentEvent`, `SignatureEvent` types; `createJobNoteSchema`, `createJobAttachmentSchema`, `createSignatureSchema`, `updateScheduleStatusSchema` Zod schemas
- **Phase I — Route Registration & Navigation**: Mobile bottom nav (Home | Jobs | History), office schedule page, `ScheduleReviewPanel`
- Fastify multipart (`@fastify/multipart`) and static file serving (`@fastify/static`)
- `useSocket` — listener system: `onJobUpdate`, `onNoteAdded`, `onAttachmentUpdate`, `onSignatureCaptured`
- File storage service for disk-based attachment uploads

### Changed

- `JobDetailClient` — full field data sections (notes, photos, signatures), offline handling, confirmation dialogs, sticky bottom action bar
- BFF proxy — fixed double `/api/v1/` prefix, empty JSON body error, and auth hook excluding `/auth/token`
- `authHook` — narrowed public endpoints to only `/login` and `/register`
- `bffFetch` — only sets `Content-Type: application/json` when body exists
- `useSocket` — added listener registration pattern for targeted subscriptions
- `LiveStatusFeed` — displays job events alongside clock events

### Fixed

- BFF proxy: double `/api/v1/` prefix in proxied requests
- BFF proxy: empty JSON body error (`FST_ERR_CTP_EMPTY_JSON_BODY`) on bodiless POST requests
- BFF proxy: `POST /auth/token` returning 401 due to overly broad auth hook exclusion of all `/api/v1/auth/*` routes

## v0.5.0 — 2026-07-05

### Added

- **Sprint 4 — Reporting & Analytics** ✅
  - Time entries report API: `GET /api/v1/reports/time-entries` with date range, project, and technician filters
  - Hours by technician API: `GET /api/v1/reports/technicians` — aggregated hours per tech
  - Hours by project API: `GET /api/v1/reports/projects` — aggregated hours per project with technician count
  - Dashboard summary API: `GET /api/v1/dashboard/summary` — hours this week, active techs, completed today, needs review, late jobs
  - CSV export endpoint: `GET /api/v1/reports/time-entries.csv` — downloadable CSV with same filters
  - Dashboard summary cards: live-updating 5-card widget on office dashboard
  - Reports page with tabbed view (Time Entries / By Technician / By Project) and date range picker
  - CSV download button on reports page
  - Shared types: `TimeEntryReportRow`, `HoursSummaryRow`, `ProjectSummaryRow`, `DashboardSummary`, `ReportFilters`
  - Frontend API client functions for all report and dashboard endpoints

### Changed

- `DashboardClient` — added `DashboardSummaryCards` widget and Reports nav link
- Office header nav — added Reports link
