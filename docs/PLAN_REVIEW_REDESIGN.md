# Review Page Redesign Plan

## Problem

The current ReviewClient.tsx (~1300 lines) renders one full card per technician per schedule. For projects with 8-15 technicians, the page becomes unusably long with duplicated project info, hard-to-read rework timelines, and buried actions.

## Proposed Architecture

```
Project Card (one per schedule)
├── Schedule header (project name, date, address, time)
├── Summary bar (N technicians, M completed, K closed, L rework)
├── Technician Assignment List (clickable pills/rows)
│   ├── Tech 1: [Status Badge] [Score Bar] ← clickable
│   ├── Tech 2: [Status Badge] [Score Bar]
│   └── ...
└── Detail Panel (slides down for selected technician)
    ├── Clock-In Location & Geofence
    ├── Original Evidence (version 0)
    │   ├── Checklist (Before / After / Notes / Signature)
    │   └── Gallery (photos, docs, signature)
    ├── Rework Cycle #1 (card with colored timeline)
    │   ├── 🟠 Office requested rework — reason
    │   ├── 🔵 Technician resumed
    │   ├── 🔵 Evidence uploaded (N photos, M notes)
    │   └── 🟢 Technician completed
    ├── Rework Cycle #2 (card with colored timeline)
    │   └── ...
    ├── Internal Notes (at the bottom)
    │   ├── Existing notes
    │   └── Add internal note input
    └── Actions (sticky bottom)
        ├── Completed: [Close Assignment] [Request Rework] [PDF]
        ├── Closed: ✓ Assignment Closed [View PDF]
        └── Rework Required: ⏳ Waiting for Technician [Force Close (admin)]
```

## Key Changes

### 1. Project-First Layout
- One project card per schedule (not per technician)
- Technician list at the top — compact pills showing name + status + score
- Clicking a technician loads their detail panel below

### 2. Rework History → Rework Cycles
- Group rework requests by cycle number (1, 2, 3...)
- Each cycle is a visually distinct card with:
  - Cycle header: "Rework Cycle #1"
  - Requested (with reason + who requested)
  - Resumed (technician resumed work)
  - Evidence uploaded during that cycle
  - Completed / Resolved
- Colors: 🟢 Completed, 🔵 Resumed/Evidence, 🟠 Requested, ⚫ Closed

### 3. Original Submission Separate
- Always show "Original Submission" as version 0 before any rework cycles
- Clear visual separation

### 4. Internal Notes at the Bottom
- Moved below evidence, above actions

### 5. Smarter Button Rules
- **Completed**: Close (disabled if missing required docs, unless admin → force close), Request Rework, PDF
- **Closed**: ✓ Closed badge, View PDF only
- **Rework Required**: Waiting badge, Force Close (admin only)
- Guard: Don't show "Request Rework" when technician is already closed or on rework

### 6. Timeline Color Coding
- Use distinct colors per event type instead of all red

## Files to Modify

| File | Change |
|---|---|
| `apps/web/src/components/office/ReviewClient.tsx` | Full rewrite — project-first layout, technician selector, detail panel |
| `apps/web/src/components/office/TechnicianReviewPanel.tsx` | **New** — extracted detail panel with rework cycles, evidence, notes, actions |
| `apps/web/src/app/(office)/review/page.tsx` | Unchanged (just renders ReviewClient) |
| `docs/implementation/CHANGELOG.md` | Update |
| `docs/PROJECT_STATUS.md` | Update (if applicable) |

## No API Changes Needed

The existing `ReviewItem` type already has:
- `current_rework_version` for cycle detection
- `other_technicians` for the tech list
- Per-tech evidence counts
- All needed GPS / location data

The existing `ReworkRequest` type already has:
- `requested_at`, `resumed_at`, `resolved_at`
- `reason`, `requested_by_name`
- `technician_id` for filtering

Components: `TechnicianReviewPanel` extracted from ReviewClient

## States to Handle

- **Loading**: Skeleton/spinner on first load
- **Empty**: "All caught up!" (existing)
- **Error**: Error banner with retry (existing)
- **Selected technician detail loading**: Per-tech spinner in detail panel
- **Action loading**: Scoped spinner per action button (existing pattern)
- **Multiple schedules**: Each schedule is its own project card, independent
- **Single tech per schedule**: Works exactly like current but cleaner
- **No rework**: Only show Original Submission, no rework section
- **Multiple rework cycles**: Show Original Submission + Cycle 1 + Cycle 2 + ...
