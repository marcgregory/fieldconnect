# FieldConnect Project Status

Last updated: 2026-07-11

This document is a snapshot. It is not a changelog.

## Current Sprint

Sprint 6 — Security & Account Hardening 🚧

## Current Progress

### Sprint 6 / Phase 1 — Email Infrastructure — Complete ✅
- `EmailProvider` abstraction with `EmailMessage`, `SendResult`, and `EmailCategory` ✅
- `ResendProvider` using the official `resend` SDK with descriptive env-missing errors ✅
- `PreviewProvider` (writes `.emails/*.html`) + `console` mode (logs only) ✅
- `getEmailService()` lazy singleton + `assertEmailConfigValid()` boot guard ✅
- `getEmailServiceStatus()` internal helper (provider / configured / previewMode) ✅
- Four inline HTML + plain-text templates: Verify Email, Password Reset, Invitation, Welcome ✅
- HTML escaping on every user-supplied value in templates ✅
- `EMAIL_PROVIDER` / `EMAIL_FROM` / `APP_URL` / `RESEND_API_KEY` in `.env` and `.env.example` ✅
- `.emails/` added to `.gitignore` ✅
- Production boot refuses `preview` mode; dev default is `preview` ✅
- All `pnpm typecheck` and `pnpm build` pass (6/6 tasks) ✅

### Sprint 6 / Phase 2 — Email Verification — Complete ✅
- `users.email_verified_at` column (migration 025) ✅
- `verification_tokens` table with SHA-256 hashing, 24h TTL, single-active rule (migration 026) ✅
- `auth_audit_logs` table — auth events keyed by nullable user_id (migration 027) ✅
- `rate_limit_events` table — atomic window-based rate limiting (migration 028) ✅
- `GET /api/v1/auth/verify-email?token=...` — consume, mark verified, audit ✅
- `POST /api/v1/auth/resend-verification` — two rate-limit windows (60s × 1, 3600s × 5) ✅
- `email-verification` service façade — `sendVerificationEmail`, fire-and-forget, `buildVerifyUrl` ✅
- `register.ts` dispatches verification email after user creation ✅
- `login.ts` blocks unverified users with 403 `EMAIL_NOT_VERIFIED`, `canResend: true` ✅
- `refresh.ts` revokes tokens for unverified users ✅
- `middleware/auth.ts` skip-list includes the two new public endpoints ✅
- Web `/verify-email` page with 60s client cooldown ✅
- Web `/verify-email/result` page with four states (success / used / expired / invalid) ✅
- Web `/register` routes to `/verify-email?email=…` after success ✅
- Web `/login` surfaces the 403 banner with a resend link ✅
- All `pnpm typecheck`, `pnpm build`, `pnpm lint` pass (4/4 tasks each) ✅

### Sprint 6 / Form Architecture — react-hook-form + zod — Complete ✅
- shadcn-style Form primitives in `@fieldconnect/ui` (`Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormDescription`, `FormMessage`, `useFormField`) ✅
- All Form primitives wired for accessibility (`htmlFor`/`id` linkage, `aria-invalid`, `aria-describedby`) ✅
- `Form` is generic over field values, so `useForm<T>()` types flow through the provider ✅
- `cn()` helper in `packages/ui/src/lib/cn.ts` ✅
- `mapApiErrorToFormError` / `mapApiResponseToFormError` in `apps/web/src/lib/map-api-error.ts` ✅
- Auth forms migrated to RHF: `/login`, `/register`, `/verify-email` (resend button) ✅
- `ProjectForm` migrated — 7 useStates collapsed into one `useForm` with `zodResolver(createProjectSchema)` ✅
- `PASSWORD_MIN = 8` constant; `registerSchema` enforces 8-char minimum; `loginSchema` accepts legacy lengths ✅
- Phase 3 schemas added (no pages this turn): `forgotPasswordSchema`, `resetPasswordSchema`, `changePasswordSchema` ✅
- `react-hook-form` and `@hookform/resolvers` added to `apps/web` deps + `packages/ui` peer deps ✅
- All `pnpm typecheck`, `pnpm build`, `pnpm lint` pass (4/4 tasks each) ✅
- TD-008 logged for the three larger forms (`ScheduleForm`, `ClockInOut`, `JobDetailClient`) still pending migration in Sprint 7 ✅

### Sprint 6 / Phase 3 — Forgot Password / Reset Password — Complete ✅
- `password_reset_tokens` table (migration 029), `db/queries/password-reset-tokens.ts` with `peek()` / `consume()` / `markUsed()` / `invalidateAllForUser()` ✅
- `GET /api/v1/auth/reset-password/:token` — read-only peek endpoint ✅
- `POST /api/v1/auth/forgot-password` — rate-limited (5 min + 1 hour windows), always 200, fire-and-forget email ✅
- `POST /api/v1/auth/reset-password` — transactional bcrypt-hash + update password + mark token used + revoke all refresh tokens ✅
- `services/password-reset.ts` — `sendPasswordResetEmail`, fire-and-forget variants, `buildResetUrl` ✅
- `'password-changed'` category + `renderPasswordChanged` template (notification after reset) ✅
- `resetPasswordSchema` updated to include `token`; `resetPasswordFormSchema` added with confirm-password refine ✅
- Auth middleware skip-list extended; `passwordResetRoutes` registered in `index.ts` ✅
- Auth audit union extended: `password_reset_requested`, `password_reset_completed`, `password_reset_failed`, `password_changed_notification_sent` ✅
- Web `/forgot-password` page — RHF + Zod, 60s cooldown, generic success banner, email pre-fill ✅
- Web `/reset-password/[token]` page — GET peek on mount, RHF form with password + confirm, three state screens (form / expired / invalid / used) ✅
- `/login` page now shows "Forgot password?" link with email pre-fill ✅
- All `pnpm typecheck`, `pnpm build`, `pnpm lint` pass (4/4 tasks each) ✅

### Sprint 6 / Phase 4 — Login Protection — Complete ✅
- Per-IP rate limit (10 failed attempts per 5 min, reuses `rate_limit_events`) ✅
- Per-account lockout (5 consecutive failures → 15 min, new `login_lockouts` table, migration 030) ✅
- Timing-safe bcrypt comparison — pre-computed dummy hash for non-existent email lookups ✅
- `trustProxy: true` on Fastify (Render proxy → real client IP in `request.ip`) ✅
- IPv6/IPv4 scope-key normalization ✅
- Frontend Retry-After countdown for 429 `RATE_LIMITED` and `ACCOUNT_LOCKED` responses ✅
- `login-attempts.ts` query module: `checkIpLimit`, `checkLockout`, `recordFailure`, `recordSuccess`, `clearExpiredLockouts` ✅
- 6 new audit actions: `login_failed`, `login_rate_limited`, `account_temporarily_locked`, `login_blocked_locked`, `login_success`, `lockout_cleared` ✅
- Schema validation errors do NOT consume rate-limit slots ✅
- Unverified-email attempts do NOT count toward lockout threshold ✅
- Stale lockout rows cleaned up inline on every check ✅
- All `pnpm typecheck`, `pnpm build`, `pnpm lint` pass (4/4 tasks each) ✅

### Sprint 6 / Phase 5 — Session Security — Complete ✅
- `031_create-sessions-and-token-family.sql` migration — `token_family_id` + `family_revoked_at` on `refresh_tokens`, `sessions` table ✅
- `refresh-tokens.ts` rewritten with `rotate()`, `detectReuse()`, `revokeByFamily()`, `revokeAllFamiliesForUser()` ✅
- `sessions.ts` query module — `create()`, `listActive()`, `findById()`, `revoke()`, `revokeAllForUser()`, `touch()`, `cleanExpired()` ✅
- `GET /api/v1/auth/sessions` — list active sessions (authenticated) ✅
- `DELETE /api/v1/auth/sessions/:id` — revoke single session (owner only) ✅
- `POST /api/v1/auth/logout-all` — revoke all sessions ✅
- Refresh token rotation — old token revoked atomically, new token in same family ✅
- Reuse detection — replayed token revokes entire family + all sessions ✅
- JWT hardening — issuer `fieldconnect-api`, audience `fieldconnect-web`, 15-min TTL, HS256 only ✅
- Trusted proxy secret — `X-FieldConnect-Proxy-Secret` validated via constant-time comparison + `net.isIP()` on `X-Real-IP` ✅
- Next.js BFF proxy (`/api/auth/login`) + all proxied routes send proxy secret + `X-Real-IP` ✅
- Login routes through BFF proxy (no direct client→API calls for login) ✅
- Login creates a `sessions` row + links refresh token to session ✅
- Password reset revokes all sessions + token families ✅
- Web `/sessions` page — view devices, revoke sessions, logout all devices ✅
- 7 new audit events: `session_created`, `token_refreshed`, `refresh_token_reuse_detected`, `session_revoked`, `logout`, `logout_all`, `all_sessions_revoked` ✅
- `ACCOUNT_LOCKED` code removed from error responses (returns `RATE_LIMITED` to prevent enumeration) ✅
- Duplicate IP rate-limit increment bug fixed in `recordFailure()` ✅
- All `pnpm typecheck`, `pnpm build` pass (6/6 tasks each) ✅

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
| Email service | ✅ Complete (abstraction + Resend + preview/console; 4 inline templates) |
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
