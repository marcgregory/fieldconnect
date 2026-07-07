# Plan: Merge Time Tracking Into JobDetail Workflow

## Problem

The technician workflow and time tracking are completely separate, causing:
- Technicians can complete jobs without ever clocking in
- No GPS or time entry for completed jobs
- Missing technicians in reports
- Confusing "GPS Unavailable" in review

## Solution

Merge clock-in/out into the JobDetail workflow so it feels like one flow.

---

## Files to Change

### 1. `apps/web/src/components/mobile/JobDetailClient.tsx`

**A. Add imports** (lines 5-18)

Add `clockIn`, `clockOut`, `getCurrentEntry` to the import block from `@/lib/api`.

Add `ActiveTimeEntry` to the type imports.

**B. Add state** (after line 158, near `showMissingDocsModal`)

```typescript
const [activeTimeEntry, setActiveTimeEntry] = useState<ActiveTimeEntry | null>(null);
const [timeEntryLoading, setTimeEntryLoading] = useState(false);
const [showClockOutPrompt, setShowClockOutPrompt] = useState(false);
```

**C. Fetch active time entry on load** (in `fetchAll`, after schedule load)

```typescript
try {
  const entry = await getCurrentEntry();
  setActiveTimeEntry(entry);
} catch { /* best-effort */ }
```

**D. Modify `handleStatusTransition`** (line 259)

- When transitioning `traveling → on_site`:
  - Check if `activeTimeEntry` exists for this schedule
  - If not: call `clockIn(schedule.project_id, 'Auto clock-in', lat, lng, accuracy)` with GPS capture
  - If clock-in fails: throw error, do not transition
  - Update `activeTimeEntry` state on success

- When transitioning `on_site → completed`:
  - If no `activeTimeEntry` OR entry's `project_id !== schedule.project_id`:
    - Show error: "Please clock in before completing this job."
    - Block transition
  - After successful transition, set `showClockOutPrompt = true`

**E. Add GPS capture helper** (already exists at line 333 as `captureGps()` — reuse it)

**F. Add Clock Out prompt modal** (after the Missing Docs modal, around line 1333)

```tsx
{showClockOutPrompt && (
  <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
    <div className="bg-white rounded-t-2xl w-full max-w-md mx-auto px-6 pt-6 pb-10">
      <h3 className="text-lg font-semibold text-gray-900 mb-2">Work Completed ✓</h3>
      <p className="text-sm text-gray-600 mb-6">
        Your work has been marked complete. Would you like to clock out now?
      </p>
      <div className="space-y-3">
        <button
          onClick={async () => {
            setShowClockOutPrompt(false);
            setTimeEntryLoading(true);
            try {
              const pos = await captureGps();
              await clockOut(undefined, pos?.lat, pos?.lng, pos?.accuracy);
              setActiveTimeEntry(null);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed to clock out');
            } finally {
              setTimeEntryLoading(false);
            }
          }}
          className="w-full bg-red-600 text-white rounded-xl py-4 text-base font-semibold shadow-lg"
        >
          Clock Out
        </button>
        <button
          onClick={() => setShowClockOutPrompt(false)}
          className="w-full bg-white border border-gray-300 text-gray-700 rounded-xl py-4 text-base font-semibold"
        >
          I'll Clock Out Later
        </button>
      </div>
    </div>
  </div>
)}
```

**G. Show time entry state** 

In the "Time" section (line 913), after the scheduled time range, add:

```tsx
{activeTimeEntry && (
  <div className="mt-3 pt-3 border-t border-gray-100">
    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Time Entry</p>
    <p className="text-sm text-green-700 font-medium">
      ✓ Clocked in since {new Date(activeTimeEntry.clock_in).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
    </p>
  </div>
)}
{!activeTimeEntry && myStatus === 'on_site' && (
  <div className="mt-3 pt-3 border-t border-gray-100">
    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Time Entry</p>
    <p className="text-sm text-amber-700 font-medium">
      ⚠ Not clocked in — clock-in will be required to complete this job
    </p>
  </div>
)}
```

---

### 2. `apps/api/src/db/queries/schedules.ts` — Backend Guard

In `updateStatus()` (around line 757, after validation), add a check:

For `on_site` transition and `completed` transition:

```typescript
// Time entry guard
if (data.status === 'on_site' || data.status === 'completed') {
  const hasTimeEntry = await client.query(
    `SELECT 1 FROM time_entries 
     WHERE user_id = $1 AND project_id = $2
       AND clock_out IS NULL
       AND clock_in >= $3::timestamptz - interval '1 day'
     LIMIT 1`,
    [techId, projectId, scheduleDate],
  );
  
  if (data.status === 'completed' && !hasTimeEntry.rows.length) {
    await client.query('ROLLBACK');
    throw new ValidationError(
      'Cannot complete job without an active time entry. Please clock in first.',
      400,
    );
  }
}
```

Note: For `on_site`, the guard is soft (frontend auto-clock-in is preferred). For `completed`, the guard is hard (no active entry = rejection).

---

## No Database Changes

No new migration needed. All changes are in application logic.

---

## Acceptance Criteria

1. Technician taps "Arrived On Site" → auto-creates time entry with GPS if none exists
2. Technician cannot "Mark Complete" without an active time entry
3. After "Mark Complete," prompt appears asking to clock out
4. Clock Out captures GPS
5. Reports show technician hours
6. Review shows clock-in GPS
7. JobDetail shows current time entry status in the UI
8. Existing ClockInOut screen remains as optional shortcut
