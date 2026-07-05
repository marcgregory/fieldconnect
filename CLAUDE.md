# CLAUDE.md

## Project

FieldConnect — Low Voltage Contracting Project Management

## Purpose

Unify existing disparate internal tools into a single, cohesive project management platform with robust time-tracking and iPhone-optimized mobile access for field technicians.

## Current Sprint

Sprint 1 — Foundation & Auth

## Current Implementation Summary

Project scaffolding is in progress. Monorepo structure with pnpm/Turborepo is set up. Next.js frontend (office dashboard), Fastify API backend, and PostgreSQL on Render are being wired together with Auth.js for authentication.

## Architecture Summary

Monorepo with pnpm + Turborepo. Next.js app (App Router) serves both the office dashboard (desktop) and the field technician portal (iPhone-optimized PWA). Fastify API server handles all business logic with raw SQL via the `pg` driver (no ORM). PostgreSQL on Render. Auth.js for authentication.

## Key Commands

```bash
# Development
pnpm dev              # Start all apps in dev mode
pnpm lint             # Lint all packages and apps
pnpm format           # Format all files with Prettier

# Database
pnpm db:migrate       # Run pending migrations
pnpm db:rollback      # Rollback last migration
pnpm db:seed          # Seed development data

# Build and Deploy
pnpm build            # Build all packages and apps
pnpm deploy           # Deploy to Render
```

## Engineering Rules

### Product First Rule

Build user-facing value before internal polish. Every sprint must produce a visible feature and a working demo.

### Single Sprint Rule

Only one sprint may be active. Do not start future sprint work until the active sprint meets its Definition of Done or the plan is explicitly changed.

### Definition of Done

A sprint is done only when the feature works, documentation is updated, TypeScript passes, the build passes, tests pass, `ROADMAP.md` is updated, `CHANGELOG.md` is updated, and `PROJECT_STATUS.md` is updated.

### Roadmap Discipline

`docs/implementation/ROADMAP.md` only answers "What should be built?" Keep it limited to Completed, In Progress, Sprint Queue, Future, and Blocked.

### Architecture Rules

Follow `docs/ARCHITECTURE.md`. Prefer a monorepo with shared packages and feature-based boundaries. Do not introduce infrastructure unless the active sprint requires it.

### State Management Rules

Never mix server state, client state, and realtime state. Document ownership, caching, invalidation, and synchronization paths before implementation.

### Package Boundaries

Keep reusable domain logic, UI primitives, API clients, validation schemas, and shared types in intentional packages. Avoid cross-feature imports that bypass public package boundaries.

### Documentation Discipline

Keep each document in its lane: PRD for behavior, scope for boundaries, architecture for design, build plan for execution, roadmap for backlog, changelog for history, project status for now, technical debt for cleanup, release plan for done.

### Testing Rules

Match testing depth to complexity. Every sprint must include the smallest test set that proves its user-facing behavior and protects critical architecture contracts.

### Release Rules

Do not mark a release Ready unless release criteria, quality gates, demo checklist, performance goals, and blocking issues are reviewed in `docs/implementation/RELEASE_PLAN.md`.

### Data Layer Rules

No ORM — all database access uses the `pg` driver directly. Migration files are hand-written SQL. Query files are organized by domain (projects, time_entries, technicians).

### Mobile First

All field technician interfaces must be designed for iPhone first and tested at 390px viewport width. Office dashboard can be desktop-first but must be usable at tablet widths.

## Known Gaps

- Existing disparate tools have not been inventoried — Sprint 2 will map their schemas and APIs
- No legacy data migration plan yet
- iPhone PWA manifest and service worker not yet configured
- No CI/CD pipeline configured on Render

## Technical Debt

See `docs/implementation/TECHNICAL_DEBT.md`.

## Next Priority

After Sprint 1 (Foundation & Auth), Sprint 2 will focus on the core data models and time-tracking API.
