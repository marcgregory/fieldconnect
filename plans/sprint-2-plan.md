# Sprint 2 — Core Data Models & Time Tracking

## Goal

Build project CRUD, time tracking (clock in/out), real-time clock event push via Socket.io, and the corresponding mobile and office UIs. All APIs protected by role-based auth.

## Rules

- No scheduling, no reporting, no payroll over-engineering
- Keep raw `pg` SQL
- Keep iPhone PWA fast and simple
- Validate with `pnpm build`, `pnpm typecheck`, and migration validation before marking complete

---

## Phase 1 — Dependencies & Middleware

### 1.1 Add dependencies
| Package | Dependency | Reason |
|---|---|---|
| `apps/api` | `socket.io` | Real-time clock event push |
| `apps/api` | `jose` | JWT verification for auth middleware |
| `apps/web` | `socket.io-client` | Connect to real-time feed |

### 1.2 Auth middleware for Fastify (`apps/api/src/middleware/auth.ts`)
- Plugin that reads `Authorization: Bearer <JWT>` header
- Verifies JWT using `jose` with `NEXTAUTH_SECRET` (shared with next-auth)
- Populates `request.user` with `{ id, email, name, role }`
- Exports `requireRole(...roles)` hook that returns 403 for unauthorized roles

### 1.3 Socket.io setup (`apps/api/src/websocket/index.ts`)
- Creates Socket.io `Server` attached to the same HTTP server as Fastify
- Two rooms: `tech:status` (office dashboard subscribes) and per-user room for targeted events
- Auth middleware on Socket.io handshake (verify JWT from `auth.token` in handshake)
- Export a helper `broadcastClockEvent(event)` called by time-entry routes

---

## Phase 2 — Database Layer

### 2.1 Migration `003_create-time-entries.sql`

```sql
CREATE TABLE time_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id),
  project_id UUID NOT NULL REFERENCES projects(id),
  clock_in TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clock_out TIMESTAMPTZ,
  break_minutes INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_time_entries_user_id ON time_entries(user_id);
CREATE INDEX idx_time_entries_project_id ON time_entries(project_id);
CREATE INDEX idx_time_entries_clock_in ON time_entries(clock_in);
```

### 2.2 Migration `004_create-technician-assignments.sql`

```sql
CREATE TABLE technician_assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, user_id)
);

CREATE INDEX idx_assignments_user ON technician_assignments(user_id);
CREATE INDEX idx_assignments_project ON technician_assignments(project_id);
```

### 2.3 Query files (`apps/api/src/db/queries/`)
- **`projects.ts`** — `findAll(filters)`, `findById(id)`, `create(data)`, `update(id, data)`, `updateStatus(id, status)`
- **`time-entries.ts`** — `clockIn(userId, projectId, notes?)`, `clockOut(id)`, `findActiveByUser(userId)`, `findByUser(userId, filters)`, `findActiveAll()` (for dashboard)
- **`technicians.ts`** — `assign(projectId, userId)`, `unassign(projectId, userId)`, `findAssignmentsByUser(userId)`, `findAssignmentsByProject(projectId)`, `findAvailableTechnicians()`

---

## Phase 3 — Shared Types & Validation

### 3.1 Types (`packages/shared/src/types/index.ts`) — add:

```typescript
// Project
export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}
export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'cancelled';

// TimeEntry
export interface TimeEntry {
  id: string;
  user_id: string;
  project_id: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
export interface ActiveTimeEntry extends TimeEntry {
  project_name: string;
  user_name?: string;
}

// TechnicianAssignment
export interface TechnicianAssignment {
  id: string;
  project_id: string;
  user_id: string;
  assigned_at: string;
  project_name?: string;
  technician_name?: string;
}

// ClockEvent (for real-time broadcast)
export interface ClockEvent {
  type: 'clock_in' | 'clock_out';
  user_id: string;
  user_name: string;
  project_id: string;
  project_name: string;
  timestamp: string;
  entry_id: string;
}
```

### 3.2 Validation (`packages/shared/src/validation/index.ts`) — add:

```typescript
// Project
export const createProjectSchema = z.object({...});
export const updateProjectSchema = z.object({...});
export const updateProjectStatusSchema = z.object({...});

// Time Entries
export const clockInSchema = z.object({ project_id: z.string().uuid(), notes: z.string().optional() });
export const clockOutSchema = z.object({ notes: z.string().optional() });

// Assignments
export const assignTechnicianSchema = z.object({ user_id: z.string().uuid() });
```

---

## Phase 4 — API Routes

All protected by `requireRole()` middleware.

| Method | Path | Roles | Description |
|---|---|---|---|
| `GET` | `/api/v1/projects` | all authenticated | List projects (with status filter) |
| `POST` | `/api/v1/projects` | admin, office_manager | Create project |
| `GET` | `/api/v1/projects/:id` | all authenticated | Get project detail |
| `PUT` | `/api/v1/projects/:id` | admin, office_manager | Update project |
| `PATCH` | `/api/v1/projects/:id/status` | admin, office_manager | Change status |
| `POST` | `/api/v1/projects/:id/assign` | admin, office_manager | Assign technician |
| `DELETE` | `/api/v1/projects/:id/assign/:userId` | admin, office_manager | Unassign technician |
| `GET` | `/api/v1/projects/:id/assignments` | all authenticated | List assigned techs |
| `POST` | `/api/v1/time-entries/clock-in` | field_technician | Clock in |
| `POST` | `/api/v1/time-entries/clock-out` | field_technician | Clock out |
| `GET` | `/api/v1/time-entries/current` | field_technician | Get active entry |
| `GET` | `/api/v1/time-entries` | all authenticated | List entries (filtered) |
| `GET` | `/api/v1/technicians/assignments` | field_technician | My assigned projects |

**Files:**
- `apps/api/src/routes/projects/index.ts`
- `apps/api/src/routes/time-entries/index.ts`
- `apps/api/src/routes/technicians/index.ts`

---

## Phase 5 — Frontend: API Client

### 5.1 `apps/web/src/lib/api.ts`
- `apiFetch<T>(url, options?)` — wrapper around `fetch` that:
  - Attaches `Authorization: Bearer <token>` header
  - Gets token from a client-side call to `/api/auth/session` (next-auth provides this)
  - Parses JSON, throws on non-2xx
- Typed methods: `getProjects()`, `createProject(data)`, `updateProject(id, data)`, `clockIn(projectId)`, `clockOut()`, `getCurrentEntry()`, `getMyAssignments()`, etc.

### 5.2 `apps/web/src/hooks/useSocket.ts`
- Hook that connects to Socket.io server at `process.env.NEXT_PUBLIC_API_URL`
- Authenticates handshake with session token
- Returns `socket` instance with typed event listeners
- Auto-reconnect with exponential backoff
- Cleanup on unmount

---

## Phase 6 — Frontend: Office Dashboard

### 6.1 Projects page (`app/(office)/projects/`)
- **Server component `page.tsx`** — fetches projects, passes to client
- **Client component `ProjectsClient.tsx`** — projects table with:
  - Create project button → modal with form
  - Edit project → modal pre-filled
  - Change status dropdown
  - Assign technician dialog (select from user list)
  - Filter by status tabs

### 6.2 Live status feed widget (`app/dashboard/DashboardClient.tsx` update)
- Add a "Live Feed" card to the dashboard grid
- Uses `useSocket()` hook to listen for `tech:status` events
- Shows recent clock-in/clock-out events with timestamp, tech name, project name
- Shows "On Site" badge for currently clocked-in technicians
- Scrollable list with auto-scroll to newest

### 6.3 Navigation
- Add "Projects" nav link to dashboard header
- Route: `/projects` → office layout → projects page

---

## Phase 7 — Frontend: Mobile Clock-in/Out

### 7.1 Clock-in UI (`apps/web/src/components/mobile/ClockInOut.tsx`)
- **Not clocked in:** Show list of assigned projects as large touch cards. Tap → clock in with 1-tap confirmation.
- **Clocked in:** Show project name, running timer (formatted HH:MM:SS, updates every 1s), clock out button. Tap clock out → confirm → done.
- Loading state: spinner while fetching current entry / assignments
- Error state: inline error message with retry
- Empty state: "No projects assigned yet" message

### 7.2 Mobile home page update (`apps/web/src/components/mobile/MobileHomeClient.tsx`)
- Replace the disabled "Clock In" button with the `ClockInOut` component
- Add a "Today's Activity" section with recent entries
- Add a "Time History" link that shows past entries

### 7.3 Time history (`apps/web/src/components/mobile/TimeHistory.tsx`)
- List of recent time entries with project name, clock in/out, total hours
- Filter by date range (today, this week, this month)

---

## Phase 8 — Integration & Main Entry

### 8.1 Update `apps/api/src/index.ts`
- Register JWT auth middleware
- Register project routes, time-entry routes, technician routes
- Initialize Socket.io server
- Pass io instance to route handlers via `app.decorate`

### 8.2 Wire up mobile page
- Server component fetches user assignments & current entry
- Passes to client component for interactive clock-in/out

### 8.3 Create office route group layout (`apps/web/src/app/(office)/layout.tsx`)
- Shared layout for office pages (optional, can use dashboard layout)

---

## Phase 9 — Validation

1. `pnpm build` — all 4+ packages build
2. `pnpm typecheck` — zero errors, strict mode
3. Migration files valid SQL (no errors when parsed)
4. `CHANGELOG.md` updated
5. `PROJECT_STATUS.md` updated
6. `ROADMAP.md` updated
7. `TECHNICAL_DEBT.md` updated

---

## File Change Summary

| Action | File |
|--------|------|
| **NEW** | `apps/api/src/middleware/auth.ts` |
| **NEW** | `apps/api/src/websocket/index.ts` |
| **NEW** | `apps/api/src/db/migrations/003_create-time-entries.sql` |
| **NEW** | `apps/api/src/db/migrations/004_create-technician-assignments.sql` |
| **NEW** | `apps/api/src/db/queries/projects.ts` |
| **NEW** | `apps/api/src/db/queries/time-entries.ts` |
| **NEW** | `apps/api/src/db/queries/technicians.ts` |
| **NEW** | `apps/api/src/routes/projects/index.ts` |
| **NEW** | `apps/api/src/routes/time-entries/index.ts` |
| **NEW** | `apps/api/src/routes/technicians/index.ts` |
| **NEW** | `apps/web/src/lib/api.ts` |
| **NEW** | `apps/web/src/hooks/useSocket.ts` |
| **NEW** | `apps/web/src/components/mobile/ClockInOut.tsx` |
| **NEW** | `apps/web/src/components/mobile/TimeHistory.tsx` |
| **NEW** | `apps/web/src/components/office/ProjectForm.tsx` |
| **NEW** | `apps/web/src/components/office/LiveStatusFeed.tsx` |
| **NEW** | `apps/web/src/app/(office)/layout.tsx` |
| **NEW** | `apps/web/src/app/(office)/projects/page.tsx` |
| **NEW** | `apps/web/src/app/(office)/projects/ProjectsClient.tsx` |
| **MODIFY** | `apps/api/src/index.ts` — register middleware, routes, socket.io |
| **MODIFY** | `apps/api/package.json` — add socket.io, jose |
| **MODIFY** | `apps/web/package.json` — add socket.io-client |
| **MODIFY** | `packages/shared/src/types/index.ts` — add Project, TimeEntry, etc. |
| **MODIFY** | `packages/shared/src/validation/index.ts` — add project, clock schemas |
| **MODIFY** | `apps/web/src/app/dashboard/DashboardClient.tsx` — add live feed + project link |
| **MODIFY** | `apps/web/src/components/mobile/MobileHomeClient.tsx` — replace with real clock |
| **MODIFY** | `apps/web/src/app/(mobile)/mobile/page.tsx` — fetch real data |
| **MODIFY** | Various doc files |
