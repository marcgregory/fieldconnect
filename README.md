# FieldConnect — Low Voltage Contracting Project Management

A unified project management platform for low voltage contracting companies. Field technicians use the iPhone-optimized mobile interface for time tracking and project updates; office staff manage jobs, scheduling, and reporting from the dashboard.

## Product

- **Target users:** Office managers, dispatchers, field technicians
- **Primary outcome:** Eliminate disparate tools and give field techs a single mobile app for time tracking and project updates
- **Current sprint:** Sprint 1 — Foundation & Auth
- **Next milestone:** Field technician mobile time tracking MVP

## Documentation Map

- `docs/PRD.md` — product behavior, users, requirements, and acceptance criteria.
- `docs/PROJECT_SCOPE.md` — scope, non-goals, assumptions, risks, and constraints.
- `docs/ARCHITECTURE.md` — system design, boundaries, data, APIs, state, and security.
- `docs/TECH_STACK.md` — selected technologies, tools, packages, and rejected options.
- `docs/DEPLOYMENT.md` — environments, release process, operations, and rollback.
- `docs/FOUNDER_OS.md` — business analysis and go-to-market strategy.
- `docs/adr/` — consequential architecture decisions.
- `docs/implementation/ROADMAP.md` — what should be built.
- `docs/implementation/BUILD_PLAN.md` — how the active and queued sprints will be built.
- `docs/implementation/PROJECT_STATUS.md` — current project snapshot.
- `docs/implementation/CHANGELOG.md` — versioned history.
- `docs/implementation/TECHNICAL_DEBT.md` — cleanup list.
- `docs/implementation/RELEASE_PLAN.md` — definition of finished.

## Commands

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

## Current Status

Foundation phase — auth and project scaffolding in progress.
