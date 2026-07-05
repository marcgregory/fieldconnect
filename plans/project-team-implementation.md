# Plan: Implement "Project Team" Properly

## Goal

Rename project-level technician assignment to **Project Team** and clearly separate it from Schedule-based work assignment.

## Files to Modify

### 1. Backend: Queries (`apps/api/src/db/queries/technicians.ts`)

Add `findProjectTeamIds(projectId: string): Promise<string[]>` — returns user_ids of technicians assigned to a project team. Used by schedule routes to validate team membership.

```sql
SELECT user_id FROM technician_assignments WHERE project_id = $1
```

### 2. Backend: Schedule Routes (`apps/api/src/routes/schedules/index.ts`)

Before conflict detection in both **POST** (create) and **PUT** (update), add team membership validation:

- Call `findProjectTeamIds()` with the project_id
- If `technician_id` is NOT in the team, return 400:
  `"Technician is not a member of this project team. Add them to the team first."`
- Then proceed with existing conflict detection

### 3. Frontend API (`apps/web/src/lib/api.ts`)

Add `removeTeamMember(projectId, userId)` — wraps `unassignTechnician` but exposed with team-semantic naming. (Keep `assignTechnician`/`unassignTechnician` internally for compatibility.)

### 4. Frontend: ProjectsClient (`apps/web/src/app/(office)/projects/ProjectsClient.tsx`)

Changes:
- Button label: "Assign" → **"Manage Team"**
- Modal title: "Assign Technician" → **"Manage Project Team"**
- "Currently Assigned:" → **"Project Team Members:"**
- Add **"Remove"** button next to each team member (calls `unassignTechnician`)
- Section label: "Available Technicians:" → **"All Technicians:"**
- Action button: "Assign" → **"Add to Team"**
- Add an explanation banner at the top of the modal:
  > "Project team members are eligible to be scheduled. Actual work time is assigned in Schedule."

### 5. Frontend: ScheduleForm (`apps/web/src/components/office/ScheduleForm.tsx`)

Changes:
- Add import: `getProjectAssignments`
- When `projectId` changes, fetch project team members via `getProjectAssignments`
- Filter the `technicians` list to only show technicians whose IDs are in the project team
- If the selected project has no team members, show:
  > "No technicians assigned to this project team. Add team members first."
- Label technician dropdown as: **"Scheduled Technician"** (was "Technician")

### 6. Run verification

```bash
pnpm typecheck
pnpm build
```
