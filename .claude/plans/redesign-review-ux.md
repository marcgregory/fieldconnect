# Redesign Review Page UX for Completed/Rework Assignments

## Audit Findings

### 1. Root Cause: Duplicate Rework Records

The backend `POST /api/v1/schedules/:id/rework` route does NOT guard against creating a second rework request when one is already open. The `createReworkRequest` INSERT and the `updateStatus` call are **not in a single transaction** (two separate functions). If an office manager double-clicks "Request Rework":

1. First click: Creates rework record (status=open), transitions technician to `rework_required`
2. Second click: Creates **another** rework record (status=open), `updateStatus` transitions from `rework_required` → `rework_required` which is a **no-op** per the `if (oldTechStatus === data.status) continue` guard

The frontend also doesn't disable the rework button after the first click. The rework modal's confirm button IS disabled when `pendingAction` matches, but there's a brief window between state updates.

**Fix:** Add a guard in the rework route: if the technician already has an open rework request, return 400. Also move the INSERT and status update into a single transaction (use `pool.connect()` + BEGIN/COMMIT like `updateStatus` does).

### 2. Bug: `current_rework_version` Not Incremented

The `updateStatus` function in `schedules.ts` never increments `schedule_technicians.current_rework_version`. When a rework cycle completes (transition from `on_site` → `completed`), the version stays at 0. This means:
- Multiple rework cycles all appear as "Rework 1" on the frontend
- The evidence gallery can't reliably group by version

**Fix:** Add `current_rework_version = current_rework_version + 1` to the UPDATE when status is `completed` AND the previous status was `on_site` (rework completion).

### 3. Frontend UX Issues

The user identified 6 specific problems, summarized here:

| # | Problem | Fix |
|---|---------|-----|
| 1 | Rework History as duplicate cards | Timeline format |
| 2 | "Request Rework" shows when Closed | Hide based on status |
| 3 | "Other Technicians" unclear | Rename to "Other Assignments" with status |
| 4 | Duplicate evidence labels | Remove gallery section headers, checklist suffices |
| 5 | Rework History as cards not timeline | Vertical timeline |
| 6 | Close/Request Rework visible after closed | Hide action buttons when status=closed |

---

## Plan

### Phase 1: Backend Fixes (2 bug fixes)

#### 1a. Guard against duplicate rework requests

**File:** `apps/api/src/routes/schedules/rework.ts`

- Before creating a new rework request, check if there's already an open rework for this technician on this schedule
- Return 400 if an open rework exists
- Also wrap the INSERT and `updateStatus` in a transaction block for atomicity

#### 1b. Fix `current_rework_version` not incrementing

**File:** `apps/api/src/db/queries/schedules.ts` (lines 877-892)

- When `data.status = 'completed'` and old status was `on_site` (meaning it's a rework completion), increment `current_rework_version`
- Can detect this in the SQL UPDATE by adding `current_rework_version = current_rework_version + CASE WHEN $1::varchar = 'completed' AND ... THEN 1 ELSE 0 END`

### Phase 2: Frontend Redesign (Complete ReviewClient.tsx rewrite)

**File:** `apps/web/src/components/office/ReviewClient.tsx`

The changes are substantial enough to justify a careful in-place rewrite of the key sections. Here's what changes:

#### 2a. Button states by assignment status

```
Screenshots show what buttons appear:

Pending Review (completed, no rework):
  ✓ Close Assignment (green/gray)
  ✓ Request Rework (red) [new]
  ✓ PDF

Rework Required:
  ✗ "Waiting for Technician" badge (no action buttons)

Rework In Progress:
  ✗ "Waiting for Technician" badge (no action buttons)

Rework Completed (rework cycle finished, back to completed):
  ✓ Close Assignment
  ✓ Request Another Rework
  ✓ PDF

Closed:
  ✓ View PDF
  ✓ View Timeline
  ✗ NO Close Assignment
  ✗ NO Request Rework
```

#### 2b. Rework History → Vertical Timeline

Replace the current card-list rendering with a vertical timeline:

```
Rework History
│
● Jul 13 5:40 PM — Office requested rework
│  Reason: Test GPS
│  By: Princess Turno
│
● Jul 13 5:42 PM — Technician resumed work
│
● Jul 13 5:48 PM — 3 photos uploaded
│
● Jul 13 5:50 PM — Technician completed rework
│
● Jul 13 5:53 PM — Assignment closed
│  By: Princess Turno
```

The timeline should derive events from:
1. `reworkRequest.requested_at` → "Office requested rework"
2. `reworkRequest.resumed_at` → "Technician resumed work"
3. Attachments/notes/signatures with matching rework_version → "N photos uploaded"
4. Rework request `resolved_at` → "Technician completed rework"
5. If status is "closed", `closed_at` → "Assignment closed"

Multiple rework cycles show as: segment 1 (original), then a "Rework Cycle 1" header, then timeline entries, then "Rework Cycle 2" header, etc.

#### 2c. "Other Technicians" → "Other Assignments"

Current:
```
Other Technicians on Schedule
Goblin  completed
```

New format with clear status badge per technician:
```
Other Assignments (2/2 completed)

✓ Dodong    closed
⟳ Goblin    rework_required
```

Show a progress summary in the header area, not a badge on the card header.

#### 2d. Evidence section cleanup

Remove duplicate labels between checklist and gallery. Keep the checklist as the single representation. Gallery section headers should be:

```
Evidence Gallery

Before Photos   After Photos   During Photos   Documents   Signature
```

Not a separate "✓ Before Photo (1)" checklist item AND a "Before" header in the gallery. The checklist should be the summary; the gallery should only show the photos/documents.

Actually, re-reading the user's feedback more carefully: they want to keep the checklist, but the gallery should NOT repeat the category labels inside the image grid. The checklist provides all the summary info needed.

Let me re-read point 4:
> Merong ✓ Before Photo (1) tapos sa baba pa ulit Before. Dalawang representation.
> Yung checklist sa taas sapat na.

So the gallery should show images grouped by type but without the "Before" / "After" text headers since the checklist already serves that purpose.

#### 2e. "Closed" state — clean slate

When assignment is closed:
- Show: "✓ Assignment Closed"
- Show: "View PDF" link
- Show: "View Timeline" link (consolidated rework history)
- Don't show: "Close Assignment" button
- Don't show: "Request Rework" button

---

### Phase 3: Re-render after closed

When a technician's assignment is closed, the ReviewItem should still be visible (for history/PDF viewing) but in a collapsed "closed" state. The current behavior of staying on the review page is fine — just the button states change.

---

## Files Changed

| File | Change |
|------|--------|
| `apps/api/src/routes/schedules/rework.ts` | Add open-rework guard + transaction |
| `apps/api/src/db/queries/schedules.ts` | Fix `current_rework_version` increment |
| `apps/web/src/components/office/ReviewClient.tsx` | Full UX redesign |
| `packages/shared/src/types/index.ts` | No changes needed |

## Design Decisions

1. **Timeline vs cards**: The timeline approach is clearer for showing the progression of events. Multiple rework cycles can stack as segments within one timeline component.

2. **Button visibility**: Harder to accidentally click wrong button when only relevant buttons show.

3. **Original evidence stays grouped under "Original Submission"**: The evidence gallery already groups by rework_version (0=original, 1+ = rework cycles). This stays.
