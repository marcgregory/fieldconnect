# Phase C — Job Lifecycle (Status State Machine) Implementation Plan

**Status transitions, audit logging, WebSocket events, and workflow UI buttons.**

---

## Overview

Build the job status state machine on top of the existing schedules infrastructure. The `schedules` table already has the status column with a CHECK constraint. We add:

1. An `audit_logs` table for insert-only history
2. A transaction-based status update query with row-level locking
3. A `PATCH /api/v1/schedules/:id/status` endpoint with role-based transition enforcement
4. Workflow buttons on the mobile job detail page
5. Office-side review controls (Completed → Office Review → Closed)
6. WebSocket events (`job:update`) when status changes
7. Frontend API client and Socket.io hook updates

---

## Files to Create

| # | File | Purpose |
|---|------|---------|
| 1 | `apps/api/src/db/migrations/004_create-audit-logs.sql` | audit_logs table |
| 2 | `apps/web/src/hooks/useSocket.ts` | Socket.io hook for job events |

## Files to Modify

| # | File | Change |
|---|------|--------|
| 1 | `packages/shared/src/types/index.ts` | Add `UpdateScheduleStatusInput.notes`, `AuditLog`, `JobEvent` types |
| 2 | `packages/shared/src/validation/index.ts` | Add `updateScheduleStatusSchema` with transition validation |
| 3 | `apps/api/src/db/queries/schedules.ts` | Add `updateStatus()` with transaction + row lock + audit log |
| 4 | `apps/api/src/routes/schedules/index.ts` | Add `PATCH /api/v1/schedules/:id/status` with role rules |
| 5 | `apps/api/src/websocket/index.ts` | Add `broadcastJobEvent()` |
| 6 | `apps/web/src/lib/api.ts` | Add `updateScheduleStatus()` |
| 7 | `apps/web/src/components/mobile/JobDetailClient.tsx` | Add workflow buttons (sticky bottom bar) |
| 8 | `apps/web/src/components/office/ScheduleReviewPanel.tsx` | NEW: Office review controls |

---

## Implementation Details

### 1. DB Migration: `004_create-audit-logs.sql`

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  action VARCHAR(50) NOT NULL,
  old_status VARCHAR(20),
  new_status VARCHAR(20),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_schedule ON audit_logs(schedule_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at);
```

### 2. Shared Types (`packages/shared/src/types/index.ts`)

Add `notes` field to `UpdateScheduleStatusInput`:
```typescript
export interface UpdateScheduleStatusInput {
  status: JobStatus;
  notes?: string;  // reason for transition (optional)
}
```

Add `AuditLog` interface:
```typescript
export interface AuditLog {
  id: string;
  schedule_id: string;
  user_id: string;
  action: string;
  old_status: string | null;
  new_status: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogWithUser extends AuditLog {
  user_name: string;
}
```

Add `JobEvent` type:
```typescript
export interface JobEvent {
  type: 'status_change' | 'assignment';
  schedule_id: string;
  project_name: string;
  technician_name: string;
  old_status: JobStatus | null;
  new_status: JobStatus;
  changed_by: string;
  timestamp: string;
}
```

### 3. Zod Schema (`packages/shared/src/validation/index.ts`)

```typescript
export const updateScheduleStatusSchema = z.object({
  status: z.enum(JOB_STATUSES as [string, ...string[]]),
  notes: z.string().max(500).optional(),
});
```

### 4. Backend Query: `updateStatus()` with Transaction

In `apps/api/src/db/queries/schedules.ts`:

```typescript
import { query, pool } from '../index';

export async function updateStatus(data: {
  id: string;
  status: JobStatus;
  user_id: string;
  notes?: string;
}): Promise<{ schedule: ScheduleWithDetails; audit: AuditLog }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Row lock
    const lockResult = await client.query(
      'SELECT status FROM schedules WHERE id = $1 FOR UPDATE',
      [data.id]
    );
    if (lockResult.rows.length === 0) {
      throw new AppError(404, 'Schedule not found');
    }

    const oldStatus = lockResult.rows[0].status as JobStatus;

    // Validate transition
    validateTransition(oldStatus, data.status, data.user_role);

    // Update status
    const updateResult = await client.query(
      `UPDATE schedules SET status = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [data.status, data.id]
    );

    // Insert audit log
    const auditResult = await client.query(
      `INSERT INTO audit_logs (schedule_id, user_id, action, old_status, new_status, metadata)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [data.id, data.user_id, 'status_change', oldStatus, data.status,
       data.notes ? JSON.stringify({ notes: data.notes }) : null]
    );

    await client.query('COMMIT');

    return {
      schedule: await findById(data.id),
      audit: auditResult.rows[0],
    };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

**Transition validation rules:**

```typescript
const VALID_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  scheduled: ['traveling'],
  traveling: ['on_site'],
  on_site: ['completed'],
  completed: ['office_review'],
  office_review: ['closed'],
  closed: [],  // terminal — no forward transitions
};

// Roles allowed per transition:
// Technician (own job): scheduled → traveling → on_site → completed
// Admin/office/dispatcher: completed → office_review → closed
// Admin only: any → any (correction)
```

Implementation will be a helper function `validateTransition(oldStatus, newStatus, userRole, scheduleTechnicianId, userId)`.

### 5. API Endpoint

In `apps/api/src/routes/schedules/index.ts`:

```
PATCH /api/v1/schedules/:id/status
```

Body: `{ status, notes? }`

Role-dependent behavior:
- `field_technician`: can only advance own jobs scheduled → traveling → on_site → completed
- `admin`, `office_manager`, `dispatcher`: can advance completed → office_review → closed
- `admin` only: can correct from any status to any status

Response: `{ success: true, data: { schedule, audit } }`

### 6. WebSocket Event

In `apps/api/src/websocket/index.ts`:

```typescript
export function broadcastJobEvent(event: JobEvent): void {
  if (!io) return;
  io.to('tech:status').emit('job:update', event);
  io.to(`user:${event.schedule_technician_id}`).emit('job:update', event);
}
```

Emit after successful status transition in the route handler.

### 7. Frontend API Client

In `apps/web/src/lib/api.ts`:

```typescript
export async function updateScheduleStatus(
  id: string,
  status: JobStatus,
  notes?: string
): Promise<{ schedule: ScheduleWithDetails; audit: AuditLog }> {
  return bffFetch(`/api/v1/schedules/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, notes }),
  });
}
```

### 8. Mobile Job Detail — Workflow Buttons

In `apps/web/src/components/mobile/JobDetailClient.tsx`:

Replace the action buttons area to include status progression buttons between the Start Navigation and Contact Customer buttons.

- Default state: show current status as disabled step label
- When job.status === 'scheduled': show "Start Traveling" blue button
- When job.status === 'traveling': show "Arrived On Site" blue button
- When job.status === 'on_site': show "Mark Complete" blue button
- When job.status === 'completed': show "Awaiting Office Review" informational badge
- When job.status === 'office_review' or 'closed': no workflow button needed

The buttons call `updateScheduleStatus(id, nextStatus)` then refetch.

Also add a confirmation dialog before each transition (simple state-based confirm).

### 9. Office Review Panel

In `apps/web/src/components/office/ScheduleReviewPanel.tsx`:

A minimal panel component that can be used in the schedule detail view showing:
- Current status
- "Move to Office Review" / "Close Job" buttons (for admin/office_manager/dispatcher)
- Notes input for transition reason

Integrated into the office schedule view page.

### 10. Socket.io Hook

In `apps/web/src/hooks/useSocket.ts`:

```typescript
'use client';
// Socket.io client hook that connects to the Fastify backend
// Subscribes to job:update events
// Returns: { isConnected, lastJobEvent }
```

Uses `socket.io-client` to connect with JWT token from session.

---

## Order of Implementation

1. Migration SQL (audit_logs table)
2. Shared types + Zod schema
3. Backend queries (`updateStatus` with transaction)
4. Backend route (`PATCH /api/v1/schedules/:id/status`)
5. WebSocket broadcast function
6. Frontend API client
7. Mobile job detail — workflow buttons
8. Office review panel
9. Socket.io hook
10. Wire WebSocket emission into status endpoint
11. Update CHANGELOG
12. Typecheck + build

---

## What's NOT Included

- Notes, photos, signatures — Phase D deferred
- Offline sync — Phase F deferred
- Reporting — Sprint 4
- Drag-and-drop calendar — Phase A (already done)
- Technician queue tabs — Phase B (already done)
