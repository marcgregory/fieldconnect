# CLAUDE.md

## Project

FieldConnect — Low Voltage Contracting Project Management

## Purpose

Unify existing disparate internal tools into a single, cohesive project management platform with robust time-tracking and iPhone-optimized mobile access for field technicians.

## Current Sprint

Sprint 6 — Security & Account Hardening (see `docs/implementation/ROADMAP.md` for phases)

## Implementation Summary

Monorepo (pnpm + Turborepo, 4 packages) fully scaffolded and deployed on Render. Next.js 14 App Router serves both the office dashboard (desktop) and field technician PWA (iPhone-optimized at 390px). Fastify API with raw SQL via `pg` driver (no ORM). PostgreSQL on Render. Auth.js with JWT + role-based access.

**Live in production:** Projects, time tracking, GPS clock in/out, geofence enforcement, multi-technician scheduling with 6-status lifecycle, job notes, photo uploads, customer signatures, offline queue, reports, CSV export, per-technician review, revision-based rework, aggregated activity feed with real-time WebSocket events.

## Key Commands

```bash
pnpm dev              # Start all apps in dev mode
pnpm lint             # Lint all packages and apps
pnpm build            # Build all packages and apps
pnpm typecheck        # TypeScript check all packages

pnpm db:migrate       # Run pending migrations
pnpm db:rollback      # Rollback last migration
pnpm db:seed          # Seed development data

pnpm --filter @fieldconnect/shared build   # Rebuild shared types only
pnpm --filter @fieldconnect/api build       # Rebuild API only
pnpm --filter @fieldconnect/web build       # Rebuild Next.js web only
```

## Architecture

### Stack

| Layer | Tech |
|---|---|
| Monorepo | pnpm + Turborepo |
| Frontend | Next.js 14 (App Router), Tailwind CSS, Socket.io Client |
| API | Fastify, `pg` (raw SQL), Socket.io Server |
| Database | PostgreSQL on Render |
| Auth | Auth.js (Credentials), JWT, role-based guards |
| Realtime | Socket.io (clock, job status, notes, attachments, signatures) |
| File Storage | Cloudinary (primary), local disk (fallback) |
| Validation | Zod (shared schemas) |

### Directory Structure

```
apps/
  api/          — Fastify server (routes/, db/queries/, db/migrations/, websocket/, middleware/)
  web/          — Next.js app (app/ router, components/office/, components/mobile/, hooks/)
packages/
  shared/       — Types, Zod schemas, shared constants (@fieldconnect/shared)
  ui/           — Reusable UI primitives (@fieldconnect/ui)
```

### Data Flow

- **API Routes**: `routes/` call `db/queries/` (raw SQL via `pg`), broadcast via `websocket/`, persist to `activity_events`
- **Activity Feed**: Every significant action inserts a row in `activity_events` with `schedule_id`, `project_id`, `technician_id`, `actor_id`, `message`, `metadata` (JSONB) — used for both live feed display and page-refresh persistence
- **WebSocket Events**: Clock events → `tech:status`, Job events → `job:update`, Notes → `note:added`, Attachments → `attachment:update`, Signatures → `signature:captured`
- **BFF Proxy**: `/api/proxy/[...path]` forwards requests to the API with JWT attached

### Database Migrations

All migrations live in `apps/api/src/db/migrations/` as sequential SQL files. No ORM — hand-written SQL. Current migration count: 024.

## Engineering Rules

### Product First

Build user-facing value before internal polish. Every sprint must produce a visible feature.

### Single Sprint

Only one sprint active at a time. No future sprint work until current sprint meets Definition of Done or plan changes.

### Definition of Done

Feature works, docs updated, TypeScript passes (`pnpm typecheck`), build passes (`pnpm build`), `ROADMAP.md` updated, `CHANGELOG.md` updated, `PROJECT_STATUS.md` updated.

### Roadmap Discipline

`docs/implementation/ROADMAP.md` only answers "What should be built?" — Completed, Sprint Queue, Future, Blocked.

### Documentation Discipline

Each doc has one lane: PRD → behavior, scope → boundaries, architecture → design, build plan → execution, roadmap → backlog, changelog → history, project status → snapshot, technical debt → cleanup, release plan → done.

### State Management

Never mix server state, client state, and realtime state. Document ownership, caching, invalidation, and sync paths before implementing.

### Package Boundaries

Reusable domain logic, UI primitives, API clients, validation schemas, and shared types go in `packages/`. No cross-feature imports that bypass public package boundaries.

### Data Layer

No ORM — `pg` driver only. Migrations are hand-written SQL. Query files organized by domain.

### Activity Feed Rules

Every `insertActivityEvent()` call must store structured metadata with the following fields:
- `schedule_id`, `project_name`, `event_type`
- `technician_id`, `technician_name`
- `actor_id`, `actor_name`

The `metadata` JSONB column is the single source of truth for frontend subtext rendering. Query-time JOINs (`technician_name`, `actor_name`) are fallbacks only.

**Per-technician events:** When a schedule has multiple technicians, always emit one activity event per technician — never a single bulk event. Iterate over the technician list and call `insertActivityEvent()` inside the loop.

**Assignment-aware messages:** Messages must refer to the technician's assignment, not the project/schedule as a whole:
- `"Assignment closed — Smith Residence"` ✅
- `"Smith Residence closed"` ❌ (implies the whole project closed)
- `"Technician note added — Smith Residence"` ✅
- `"Note added to Smith Residence"` ❌ (vague, no per-tech scoping)

Use em-dash (`—`) as the separator between the action and the project name.

### Live Feed Frontend Rules

**Message + subtext structure:**
- `message` = what happened + project name (e.g. `"Assignment closed — Smith Residence"`)
- `subtext` = who + by whom (e.g. `"Technician: Marc Gregory Turno • Closed by: Princess Turno"`)

**Subtext format patterns:**
- Status changes / close: `"Technician: {name} • By: {actor}"` or `"Technician: {name} • Closed by: {actor}"`
- Technician notes: `"Technician: {name} • By: {actor}"`
- Internal notes: `"For: {target} • By: {actor}"`
- Photos/attachments: `"Technician: {name} • By: {actor}"`
- Signatures: `"Technician: {name} • By: {actor} • {label}"`

**Cross-source dedup:** Socket events and historical DB events represent the same real-world occurrence. Use `buildContentKey()` to normalize them:
- Normalize status `technician_started_traveling` → `traveling`, etc.
- Round timestamps to 2s window so micro-offsets produce the same key
- Dedup by `contentKey` before adding to the feed array

**Socket event message matching:** When rendering socket `JobEvent` with `new_status: 'closed'`, always show `"Assignment closed — {project}"` not `"Project closed"`. This ensures closing one tech's assignment doesn't read like the whole project shut down.

### Shared Event Types

When adding new fields to WebSocket event types (`NoteEvent`, `AttachmentEvent`, etc.), update both:
1. `packages/shared/src/types/index.ts` — the TypeScript interface
2. All `broadcast*Event()` call sites — pass the new field

The `NoteEvent` type must include `technician_name` for the frontend to distinguish "Technician: {name}" from "For: {name}" in internal vs technician notes.

### Mobile First

Field technician interfaces designed for iPhone first, tested at 390px. Office dashboard desktop-first but usable at tablet widths.

### Testing

Match depth to complexity. Every sprint must include the smallest test set that proves user-facing behavior and protects critical architecture contracts.

## Known Gaps

- No CI/CD pipeline on Render (manual deploy)
- No email infrastructure (planned for Sprint 6)
- No password reset flow
- No rate limiting on auth endpoints
- No file upload security validation
- No security headers (Helmet)

## Technical Debt

See `docs/implementation/TECHNICAL_DEBT.md`.

## Next Priority

Finish Sprint 6 — Security & Account Hardening. See `docs/implementation/ROADMAP.md` for Sprint 6 phases (Email Verification, Forgot Password, Login Protection, Session Security, File Upload Security, Security Headers, Audit Monitoring).
