# Changelog

All notable project changes should be documented here. Keep this file versioned and historical; do not use it as a current status report.

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
