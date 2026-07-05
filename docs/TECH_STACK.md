# FieldConnect Technology Stack

## Summary

Full-stack JavaScript/TypeScript monorepo with a Next.js frontend (office + mobile PWA), Fastify API backend, PostgreSQL database on Render, and raw SQL access via the `pg` driver.

## Technology Decision Summary

### Recommended Stack

- **Frontend:** Next.js 14+ (App Router)
- **Backend:** Fastify
- **Database:** PostgreSQL
- **ORM:** Raw SQL via `pg` driver (no ORM)
- **Auth:** Auth.js (NextAuth.js)
- **Monorepo:** pnpm + Turborepo
- **Realtime:** Socket.io
- **Hosting:** Render

### Chosen Stack

As above — user approved during bootstrap.

### Approval Status

Approved by user on 2026-07-05.

### Alternatives Considered

- Express vs Fastify → Fastify chosen for performance and TypeScript DX
- Prisma/Drizzle/Kysely → All rejected — user does not want an ORM
- Supabase → Rejected — render was preferred
- React Native → Rejected — PWA sufficient for form-heavy use case

### Tradeoffs

- Raw SQL gives full control but requires handwritten migrations and query files
- Fastify has a smaller ecosystem than Express but better performance
- PWA cannot access all native APIs (background sync, push) but covers 95% of needs
- Single monorepo simplifies sharing but couples build steps

## Application

| Technology | Version | Purpose |
|---|---|---|
| Next.js | 14+ | Frontend framework (App Router) |
| React | 18+ | UI library |
| Tailwind CSS | 3.x | Styling |
| TypeScript | 5.x | Type safety |
| next-pwa | latest | PWA manifest and service worker |

## Backend

| Technology | Version | Purpose |
|---|---|---|
| Fastify | 4.x | HTTP server |
| TypeScript | 5.x | Type safety |
| pg | 8.x | PostgreSQL driver |
| node-pg-migrate | latest | SQL migration runner |
| zod | 3.x | Request validation |
| Socket.io | 4.x | Real-time WebSocket |

## Database and Storage

| Technology | Purpose |
|---|---|
| PostgreSQL 15+ | Primary database on Render |
| Render Disk | Photo storage (file system-based) |

## Authentication and Authorization

| Technology | Purpose |
|---|---|
| Auth.js (NextAuth.js) | Authentication framework |
| bcrypt | Password hashing |
| JWT | Session tokens |

## Realtime and Background Jobs

| Technology | Purpose |
|---|---|
| Socket.io | Real-time technician status updates |
| node-cron | Scheduled tasks (future) |

## Testing

| Technology | Purpose |
|---|---|
| Vitest | Unit and integration tests |
| Playwright | End-to-end testing (future) |

## Development Tools

| Technology | Purpose |
|---|---|
| pnpm | Package manager |
| Turborepo | Monorepo task orchestration |
| ESLint | Code linting |
| Prettier | Code formatting |
| husky | Git hooks (future) |

## Deployment and Operations

| Technology | Purpose |
|---|---|
| Render.com | Hosting (Web Services + PostgreSQL) |
| Render Blueprints | Infrastructure as code (future) |

## Package Recommendations

### Core
- `next`, `react`, `react-dom` — Frontend
- `fastify` — Backend server
- `pg` — PostgreSQL driver
- `node-pg-migrate` — SQL migrations
- `next-auth` — Authentication
- `zod` — Validation
- `socket.io`, `socket.io-client` — Realtime

### UI
- `tailwindcss`, `postcss`, `autoprefixer` — Styling
- `@headlessui/react` — Accessible UI primitives
- `@heroicons/react` — Icons
- `date-fns` — Date formatting
- `recharts` — Charts (office dashboard)

### Dev
- `typescript`
- `eslint`, `prettier`
- `vitest`
- `tsx` — TypeScript execution

## Rejected Options

| Option | Reason |
|---|---|
| Prisma / Drizzle / Kysely | User explicitly rejected ORMs |
| Express | Fastify has better perf and TypeScript DX |
| Supabase | User preferred Render |
| React Native / Flutter | PWA is sufficient |
| Next.js API routes only | Need separate backend for WebSocket and background jobs |
| Firebase | Vendor lock-in concerns |
| Microservices | Overkill for single developer / single product |
