# Plan: Per-Technician Evidence Ownership

## Problem

Evidence (attachments, notes, signatures) is schedule-level only. On multi-technician schedules, one technician's uploads appear as everyone's. The checklist is evaluated against all evidence, not per-tech.

## Changes

### 1. Database Migration — `022_add_technician_id_to_evidence.sql`

Add `technician_id` column to all three evidence tables:

```sql
ALTER TABLE job_attachments ADD COLUMN technician_id UUID REFERENCES users(id);
ALTER TABLE job_notes      ADD COLUMN technician_id UUID REFERENCES users(id);
ALTER TABLE signatures     ADD COLUMN technician_id UUID REFERENCES users(id);

-- Backfill: set technician_id = user_id for rows where the uploader is a field_technician
UPDATE job_attachments ja
  SET technician_id = ja.user_id
  FROM users u
  WHERE u.id = ja.user_id AND u.role = 'field_technician'
  AND ja.technician_id IS NULL;

UPDATE job_notes jn
  SET technician_id = jn.user_id
  FROM users u
  WHERE u.id = jn.user_id AND u.role = 'field_technician'
  AND jn.technician_id IS NULL;

UPDATE signatures s
  SET technician_id = s.user_id
  FROM users u
  WHERE u.id = s.user_id AND u.role = 'field_technician'
  AND s.technician_id IS NULL;
```

### 2. Shared Types

Add `technician_id?: string | null` to:
- `JobAttachment`
- `JobNote`
- `Signature`

### 3. Backend — Query Layer

**`job-attachments.ts`:**
- `create()` — accept and insert `technician_id`
- `findBySchedule()` — add optional `technician_id` filter param

**`job-notes.ts`:**
- `create()` — accept and insert `technician_id`
- `findBySchedule()` — add optional `technician_id` filter param

**`signatures.ts`:**
- `create()` — accept and insert `technician_id`
- `findBySchedule()` — add optional `technician_id` filter param

### 4. Backend — Routes

**`job-attachments.ts` (POST):**
- Set `technician_id: request.user!.id` in create data
- Fix broadcast `technician_id` — use `request.user!.id` instead of `schedule.technician_ids?.[0]`

**`job-attachments.ts` (DELETE):**
- Fix broadcast `technician_id` — use `request.user!.id`

**`job-notes.ts`:**
- Set `technician_id: request.user!.id` in create data
- Fix broadcast `technician_id` — use `request.user!.id`

**`signatures.ts`:**
- Set `technician_id: request.user!.id` in create data
- Fix broadcast `technician_id` — use `request.user!.id`

### 5. Mobile Detail View — Evidence Ownership

**`JobDetailClient.tsx`:**
- Pass `currentUserId` to data fetches
- Filter evidence lists to only `technician_id === currentUserId` (or `user_id === currentUserId` for legacy rows)
- Checklist counts only the current tech's evidence
- Upload flow already includes `request.user!.id` — no change needed on upload

### 6. Office Review — Per-Technician Cards

**`ReviewClient.tsx`:**
- Group expanded evidence by technician_id
- Render one checklist + evidence section per technician
- Evaluate per-tech checklist independently
- Show technician name heading above each tech's section

## Files Changed (18 total)

| # | File | Change |
|---|------|--------|
| 1 | `apps/api/src/db/migrations/022_add_technician_id_to_evidence.sql` | **New** — migration |
| 2 | `packages/shared/src/types/index.ts` | Add `technician_id` to types |
| 3 | `apps/api/src/db/queries/job-attachments.ts` | Add `technician_id` to create/query |
| 4 | `apps/api/src/db/queries/job-notes.ts` | Add `technician_id` to create/query |
| 5 | `apps/api/src/db/queries/signatures.ts` | Add `technician_id` to create/query |
| 6 | `apps/api/src/routes/schedules/job-attachments.ts` | Set `technician_id`, fix broadcast |
| 7 | `apps/api/src/routes/schedules/job-notes.ts` | Set `technician_id`, fix broadcast |
| 8 | `apps/api/src/routes/schedules/signatures.ts` | Set `technician_id`, fix broadcast |
| 9 | `apps/web/src/components/mobile/JobDetailClient.tsx` | Filter evidence by tech |
| 10 | `apps/web/src/components/office/ReviewClient.tsx` | Per-tech grouping + checklist |

## Acceptance

1. Goblin uploads before/after/signature on shared schedule
2. Marc opens same job → sees 0 before, 0 after, 0 signature for himself
3. Goblin opens job → sees his uploads
4. Office review shows Goblin's evidence under a Goblin card only
5. Office per-tech checklist: Goblin's items satisfy only Goblin's checklist
6. `pnpm lint` / `pnpm build` pass
