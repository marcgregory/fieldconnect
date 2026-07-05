# FieldConnect Architecture

Last updated: 2026-07-05

## Complexity Classification

**Production** — Multi-role system with mobile-critical workflows, realtime updates, data integrity requirements, and existing data migration needs.

Justification:
- Two distinct user surfaces (office dashboard + field mobile)
- Realtime synchronization between field and office
- Offline-capable time tracking
- Integration with existing tools and data
- Audit-grade time entry integrity

## Architecture Summary

Modular monorepo containing a Next.js frontend application and a Fastify API backend, sharing packages for types, database access, and UI components. PostgreSQL on Render is the single data store. Realtime updates via WebSocket for live technician status changes.

```
┌──────────────┐    ┌──────────────┐
│  Next.js App  │    │  Fastify API │
│  (Office +    │◄──►│  (Business   │
│   Mobile PWA) │    │   Logic)     │
└──────────────┘    └──────┬───────┘
                           │
                    ┌──────▼───────┐
                    │  PostgreSQL  │
                    │  (Render)    │
                    └──────────────┘
```

## Recommended Architecture

- **Frontend:** Single Next.js app (App Router) serving both the office dashboard and the field technician mobile portal via route groups and responsive design
- **Backend:** Fastify API server with raw SQL via `pg` driver — no ORM
- **Database:** PostgreSQL on Render
- **Monorepo:** pnpm + Turborepo with shared packages
- **Auth:** Auth.js (NextAuth.js) with JWT sessions
- **Realtime:** WebSocket (Socket.io) for live technician status updates
- **Mobile:** PWA with service worker for offline support

## Rationale

- **Single Next.js app** avoids maintaining two separate frontend codebases while delivering different UIs via route groups and responsive breakpoints
- **Fastify as separate API** keeps business logic independent from the frontend — important for integrating with existing tools and potentially exposing an API later
- **Raw SQL** gives complete control over query performance and data integrity without ORM overhead
- **PostgreSQL** is reliable, well-understood, and supports the relational data model this domain needs (projects, technicians, time entries, schedules)
- **Monorepo** enables shared types, database access patterns, and UI primitives across the frontend and API

## Rejected Alternatives

| Alternative | Reason Rejected |
|---|---|
| React Native / Flutter | Overkill for form-heavy data entry. PWA is faster, cheaper, and sufficient. |
| Microservices | Only one team, one product. Adds operational complexity for no benefit. |
| Next.js API routes only | Limits flexibility for background jobs, WebSocket handling, and future API consumers. |
| ORM (Prisma, Drizzle, Kysely) | User explicitly does not want an ORM. Raw SQL via `pg` driver. |
| Firebase / Supabase | Vendor lock-in concerns. User chose Render for hosting. |
| Monorepo without Turborepo | Caching and parallel task execution are valuable even for a single developer. |

## Folder Structure

```
fieldconnect/
├── apps/
│   ├── web/                    # Next.js application
│   │   ├── src/
│   │   │   ├── app/            # App Router pages
│   │   │   │   ├── (office)/   # Office dashboard routes
│   │   │   │   │   ├── dashboard/
│   │   │   │   │   ├── projects/
│   │   │   │   │   ├── schedule/
│   │   │   │   │   ├── reports/
│   │   │   │   │   └── admin/
│   │   │   │   ├── (mobile)/   # Mobile field tech routes
│   │   │   │   │   ├── clock/
│   │   │   │   │   ├── my-jobs/
│   │   │   │   │   └── profile/
│   │   │   │   ├── api/        # Next.js API routes (BFF layer)
│   │   │   │   └── auth/       # Auth.js pages
│   │   │   ├── components/     # React components
│   │   │   │   ├── ui/         # Base UI components
│   │   │   │   ├── office/     # Office-specific components
│   │   │   │   └── mobile/     # Mobile-specific components
│   │   │   └── lib/            # Client utilities
│   │   ├── public/             # Static assets, PWA manifest
│   │   └── package.json
│   │
│   └── api/                    # Fastify backend
│       ├── src/
│       │   ├── routes/         # API route handlers
│       │   │   ├── auth/
│       │   │   ├── projects/
│       │   │   ├── time-entries/
│       │   │   ├── technicians/
│       │   │   ├── schedule/
│       │   │   └── reports/
│       │   ├── middleware/     # Auth, validation, error handling
│       │   ├── db/             # Database connection and queries
│       │   │   ├── migrations/ # SQL migration files
│       │   │   ├── queries/    # Domain-specific SQL files
│       │   │   │   ├── projects/
│       │   │   │   ├── time-entries/
│       │   │   │   └── technicians/
│       │   │   └── index.ts    # pg Pool setup
│       │   ├── websocket/      # Socket.io handlers
│       │   └── index.ts        # Fastify server entry
│       └── package.json
│
├── packages/
│   ├── shared/                 # Shared types and validation
│   │   ├── src/
│   │   │   ├── types/         # TypeScript interfaces
│   │   │   └── validation/    # Zod schemas
│   │   └── package.json
│   │
│   └── ui/                     # Shared UI component library
│       ├── src/
│       │   ├── components/    # Reusable UI primitives
│       │   └── styles/        # Shared Tailwind config
│       └── package.json
│
├── turbo.json
├── pnpm-workspace.yaml
└── package.json
```

## Package Boundaries

- **`@fieldconnect/shared`** — Types, validation schemas, constants. Zero runtime dependencies on other packages in the monorepo.
- **`@fieldconnect/ui`** — Shared UI components built on Tailwind CSS. Consumed by `apps/web` only.
- **`apps/web`** — Next.js. May import from `@fieldconnect/shared` and `@fieldconnect/ui`. Makes API calls to `apps/api`.
- **`apps/api`** — Fastify. May import from `@fieldconnect/shared`. Never imports from UI packages.

## Feature Boundaries

- **Auth** — Registration, login, role management, session handling
- **Projects** — CRUD, status management, assignment
- **Time Tracking** — Clock in/out, manual entry, breaks, notes, photos
- **Schedule** — Calendar, assignments, conflict detection
- **Dashboard** — Widgets, summaries, real-time status
- **Reports** — Time reports, project reports, export

## Application Boundaries

The Next.js app handles all UI rendering and client-side state. The Fastify API handles all business logic, database access, and WebSocket connections. The Next.js app communicates with the Fastify API via HTTP REST calls and WebSocket connections for real-time features.

## Shared Packages

- **`@fieldconnect/shared`** — TypeScript types for all domain entities, Zod validation schemas for API requests/responses
- **`@fieldconnect/ui`** — Button, Card, Input, Modal, Table, Badge, Spinner — all Tailwind-based and responsive

## Data Model

### Core Entities

```
users
  id UUID PK
  email VARCHAR UNIQUE
  name VARCHAR
  role ENUM (admin, office_manager, dispatcher, field_technician)
  created_at TIMESTAMP
  updated_at TIMESTAMP

projects
  id UUID PK
  name VARCHAR
  description TEXT
  status ENUM (active, on_hold, completed, cancelled)
  address TEXT
  contact_name VARCHAR
  contact_phone VARCHAR
  notes TEXT
  created_by UUID FK -> users.id
  created_at TIMESTAMP
  updated_at TIMESTAMP

technician_assignments
  id UUID PK
  project_id UUID FK -> projects.id
  user_id UUID FK -> users.id
  role VARCHAR
  assigned_at TIMESTAMP

time_entries
  id UUID PK
  user_id UUID FK -> users.id
  project_id UUID FK -> projects.id
  clock_in TIMESTAMP
  clock_out TIMESTAMP (nullable)
  break_minutes INT DEFAULT 0
  notes TEXT
  gps_lat DECIMAL (nullable)
  gps_lng DECIMAL (nullable)
  photo_urls TEXT[] (nullable)
  approved BOOLEAN DEFAULT false
  approved_by UUID FK -> users.id (nullable)
  synced_offline BOOLEAN DEFAULT false
  created_at TIMESTAMP
  updated_at TIMESTAMP

schedules
  id UUID PK
  user_id UUID FK -> users.id
  project_id UUID FK -> projects.id
  date DATE
  start_time TIME
  end_time TIME
  notes TEXT
  created_by UUID FK -> users.id
  created_at TIMESTAMP
  updated_at TIMESTAMP
```

## Database Recommendation

PostgreSQL on Render (Starter plan at $7/mo). Raw SQL with `pg` driver. Migrations handled via `node-pg-migrate` with SQL files in `apps/api/src/db/migrations/`.

## API Architecture

RESTful JSON API at `api.fieldconnect.com`. Versioned from the start (`/api/v1/...`). Key endpoints:

- `POST /api/v1/auth/login` — Authentication
- `GET /api/v1/projects` — List projects
- `POST /api/v1/projects` — Create project
- `GET /api/v1/projects/:id` — Project details
- `POST /api/v1/time-entries/clock-in` — Clock in
- `POST /api/v1/time-entries/clock-out` — Clock out
- `GET /api/v1/time-entries` — List time entries (filtered by user/project/date)
- `GET /api/v1/schedule` — Get schedule
- `POST /api/v1/schedule` — Create schedule entry
- `GET /api/v1/reports/time` — Generate time report

## Authentication and Authorization

Auth.js (NextAuth.js) with JWT strategy. Roles enforced via middleware on both Next.js routes and Fastify API routes. Role hierarchy: Admin > Office Manager > Dispatcher > Field Technician.

## State Management

### Server State

All data from the Fastify API is fetched via server components (Next.js) or SWR/React Query on the client. Cached and invalidated on mutation.

### Client State

Minimal client state — form inputs, UI state (open/close modals, active tab), and real-time status indicators. No complex client state management library needed.

### Realtime State

Technician clock-in/clock-out events, status changes. Pushed from Fastify via WebSocket (Socket.io). Client subscribes to relevant channels. Realtime state never persisted client-side — canonical source is always the database.

### Synchronization Rules

1. Server state is authoritative — never mutate server data in client state
2. Realtime events update the UI optimistically but reconcile on next server fetch
3. Offline time entries are stored in IndexedDB and synced on reconnect
4. After sync, reconcile any conflicts (server data wins)

## Realtime Strategy

Socket.io server in the Fastify app. Two primary channels:
- `tech:status` — Technician clock in/out events broadcast to office dashboard
- `schedule:updates` — Schedule changes pushed to assigned technicians

## Background Jobs

Initial scope is minimal. Future consideration: daily report generation, data export, stale session cleanup. These would use a simple cron-like scheduler (node-cron) in the Fastify process.

## Security Architecture

- HTTPS everywhere (enforced at Render edge)
- JWT tokens with secure HTTP-only cookies
- CSRF protection via Next.js built-in
- Input validation via Zod schemas
- SQL injection protection via parameterized queries (pg driver)
- Role-based access control on every API endpoint
- Rate limiting on auth endpoints
- Environment-based secrets management

## Observability

- Structured JSON logging (pino — Fastify default)
- Error tracking via application logs
- Database monitoring via Render dashboard
- Uptime monitoring via Render

## Deployment Architecture

```
Render.com
├── Web Service: apps/api (Fastify)
│   └── Port: 3001
├── Web Service: apps/web (Next.js)
│   └── Port: 3000
└── PostgreSQL Database
    └── Private network (not publicly accessible)
```

## Performance Targets

- Time entry API response: <200ms
- Dashboard page load: <2s
- Clock-in flow: <1s API response
- Real-time event delivery: <500ms
- Lighthouse mobile score: 80+

## Accessibility Requirements

- Office dashboard: WCAG 2.1 AA compliance
- Mobile interface: touch targets minimum 44x44px
- Color contrast ratios meet WCAG AA standards
- Screen reader support for form inputs and status updates

## Architecture Risks

- Offline support adds significant complexity — defer to later sprint if not critical
- WebSocket connections may be affected by mobile network conditions — implement reconnection with exponential backoff
- Raw SQL without ORM requires careful migration management and query organization
- Single Fastify process for both HTTP and WebSocket may need separation if load increases
