# FieldConnect Context

Last updated: 2026-07-05

This is a backward-compatible AI handoff file. Prefer `README.md`, `CLAUDE.md`, and `docs/implementation/PROJECT_STATUS.md` for the current operating model.

## Project Purpose

Unify disparate internal tools for a low voltage contracting company into a single project management and time-tracking platform with iPhone-optimized mobile access for field technicians.

## Target Users

- Office managers (project oversight, reporting)
- Dispatchers (scheduling technicians)
- Field technicians (time tracking, project updates from iPhone)

## Current Sprint

Sprint 1 — Foundation & Auth (Not started)

## Architecture Summary

Monorepo (pnpm + Turborepo) with:
- **apps/web** — Next.js (App Router) serving office dashboard + iPhone PWA
- **apps/api** — Fastify with raw SQL via `pg` driver (no ORM)
- **packages/shared** — Types and validation
- **packages/ui** — Shared UI components
- **Database:** PostgreSQL on Render
- **Auth:** Auth.js (NextAuth.js) with JWT
- **Realtime:** Socket.io for live status updates
- **Mobile:** PWA (no native app)

## Important Decisions

1. **No ORM** — All database access via raw SQL with `pg` driver
2. **PostgreSQL on Render** — Managed database, $7/mo starter plan
3. **PWA over native mobile** — Field tech interface is a PWA within the Next.js app
4. **Separate Fastify API** — Not using Next.js API routes for backend logic
5. **Fastify over Express** — Better performance and TypeScript DX

## Current Priorities

1. Scaffold the monorepo structure
2. Spin up PostgreSQL on Render
3. Implement Auth.js with role-based login
4. Build login/registration pages with role-appropriate redirects

## Where to Start Reading

1. `README.md` for the project map.
2. `CLAUDE.md` for engineering rules and AI handoff.
3. `docs/implementation/PROJECT_STATUS.md` for current state.
4. `docs/PRD.md` and `docs/PROJECT_SCOPE.md` for product boundaries.
5. `docs/ARCHITECTURE.md` for system design and constraints.
6. `docs/implementation/BUILD_PLAN.md` for sprint execution.
7. `docs/implementation/ROADMAP.md` for what should be built.
8. `docs/adr/` for consequential decisions.

## Known Gaps

- No inventory of existing tools yet (planned for Sprint 2)
- No CI/CD pipeline configured
- No PWA manifest or service worker implemented yet

## Next Best Task

Begin Sprint 1 implementation: initialize the monorepo with pnpm workspace and Turborepo.
