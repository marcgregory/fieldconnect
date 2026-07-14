# FieldConnect v1.0.0-beta-feature-complete — Release Notes

**Date:** 2026-07-14
**Type:** Closed Beta
**Tag:** `v1.0.0-beta-feature-complete`

---

## Overview

FieldConnect is a unified project management platform for low-voltage contracting. This beta release marks the feature-complete milestone — all core functionality for field technician operations, office management, reporting, and security hardening is implemented and verified.

## What's Included

### Field Technician Mobile App (iPhone-optimized PWA)

- **Clock in/out** with GPS location capture, timer display, and geofence enforcement
- **Job queue** with Today/Upcoming/Completed tabs
- **Job detail** with status stepper, workflow buttons, and full activity
- **Job notes** with per-technician isolation and rework versioning
- **Photo upload** with client-side compression and offline queue
- **Customer signature** capture via canvas
- **Offline support** for notes, photos, and signatures (IndexedDB queue with auto-sync)
- **Rework workflow** — banner notification, resume work, append evidence
- **PWA installable** with session-based install prompt logic
- **Real-time updates** via WebSocket (Socket.IO)

### Office Dashboard (Desktop)

- **Project management** — create, edit, status changes, team assignment
- **Multi-technician scheduling** with conflict detection and calendar view
- **Live status feed** — real-time clock and job events with cross-source dedup
- **Work review panel** with evidence grouped by revision, geofence badges, rework history
- **Rework requests** — create, track, and verify rework cycles
- **Reports** — time entries, hours by technician, hours by project, CSV export
- **Completion PDF** — professional A4 PDF with project info, time summary, notes, and signatures
- **Session management** — view/revoke active sessions, logout all devices
- **Audit log viewer** (admin-only)

### Security & Account Features

- **Email verification** with rate-limited resend
- **Forgot/reset password** with secure token flow and email notification
- **Login rate limiting** — per-IP (10/5min) and per-account lockout (5 failures → 15min)
- **Timing-safe login** — dummy bcrypt hash for unknown emails
- **Session management** — refresh token rotation with reuse detection
- **JWT hardening** — 15min TTL, issuer/audience validation, HS256 only
- **Security headers** — CSP with nonce, HSTS, X-Content-Type-Options, Permissions-Policy, frame-ancestors, CORS
- **Cache-Control: no-store** on all authenticated API responses
- **Auth audit logging** for all authentication events
- **Trusted proxy secret** for IP verification

## Known Limitations (Beta)

- **Offline clock-in/out**: Not available by design (clock requires GPS + server state)
- **iOS testing**: Browser tests run on Chromium at 390px viewport; real iOS device testing not performed
- **Scale**: No load testing performed; optimal for <50 concurrent users
- **CI/CD**: Manual deploy to Render; no automated CI/CD pipeline
- **Monitoring**: No Sentry/DataDog integration; Render dashboard only
- **Backup verification**: Render PostgreSQL automated backups configured; no verified restore drill

## Technical Details

- **Stack**: Next.js 14 (App Router), Fastify, PostgreSQL, Socket.IO, Auth.js, Tailwind CSS
- **Architecture**: pnpm + Turborepo monorepo (4 packages: shared, ui, api, web)
- **Database**: 31+ hand-written SQL migrations, no ORM
- **File storage**: Cloudinary (primary), local disk (fallback)
- **Email**: Resend SDK with HTML + plain-text templates
- **Testing**: Playwright E2E, Vitest unit tests

## Deployment

See [deployment-checklist.md](deployment-checklist.md).
