// ─── User Roles ────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'office_manager' | 'dispatcher' | 'field_technician';

export const USER_ROLES: UserRole[] = [
  'admin',
  'office_manager',
  'dispatcher',
  'field_technician',
];

// ─── User ──────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface CreateUserInput {
  email: string;
  name: string;
  password: string;
  role: UserRole;
}

export interface LoginInput {
  email: string;
  password: string;
}

// ─── API Response ──────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─── Health ────────────────────────────────────────────────────────────────

export interface HealthStatus {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  database: 'connected' | 'disconnected';
}

// ─── Project ───────────────────────────────────────────────────────────────

export type ProjectStatus = 'active' | 'on_hold' | 'completed' | 'cancelled';

export const PROJECT_STATUSES: ProjectStatus[] = [
  'active',
  'on_hold',
  'completed',
  'cancelled',
];

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

export interface CreateProjectInput {
  name: string;
  description?: string;
  address?: string;
  contact_name?: string;
  contact_phone?: string;
  notes?: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  address?: string;
  contact_name?: string;
  contact_phone?: string;
  notes?: string;
}

// ─── Time Entry ────────────────────────────────────────────────────────────

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
  project_address: string | null;
}

export interface TimeEntryWithProject extends TimeEntry {
  project_name: string;
}

export interface CreateTimeEntryInput {
  project_id: string;
  notes?: string;
}

// ─── Technician Assignment ─────────────────────────────────────────────────

export interface TechnicianAssignment {
  id: string;
  project_id: string;
  user_id: string;
  assigned_at: string;
}

export interface TechnicianAssignmentWithDetails extends TechnicianAssignment {
  project_name: string;
  technician_name: string;
  technician_role: string;
}

// ─── Clock Event (for real-time broadcast) ─────────────────────────────────

export interface ClockEvent {
  type: 'clock_in' | 'clock_out';
  user_id: string;
  user_name: string;
  project_id: string;
  project_name: string;
  timestamp: string;
  entry_id: string;
  duration_hours?: number;
}

// ─── Schedule / Job Status ──────────────────────────────────────────────────

export type JobStatus = 'scheduled' | 'traveling' | 'on_site' | 'completed' | 'office_review' | 'closed';

export const JOB_STATUSES: JobStatus[] = [
  'scheduled',
  'traveling',
  'on_site',
  'completed',
  'office_review',
  'closed',
];

export interface Schedule {
  id: string;
  project_id: string;
  technician_id: string;
  scheduled_date: string;
  start_time: string | null;
  end_time: string | null;
  status: JobStatus;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ScheduleWithDetails extends Schedule {
  project_name: string;
  project_address: string | null;
  technician_name: string;
}

export interface CreateScheduleInput {
  project_id: string;
  technician_id: string;
  scheduled_date: string;
  start_time?: string;
  end_time?: string;
  notes?: string;
}

export interface UpdateScheduleInput {
  start_time?: string;
  end_time?: string;
  notes?: string;
  technician_id?: string;
  scheduled_date?: string;
}

export interface UpdateScheduleStatusInput {
  status: JobStatus;
  notes?: string;
}

// ─── API Payload Types ─────────────────────────────────────────────────────

export interface ProjectListFilters {
  status?: ProjectStatus;
  search?: string;
}

export interface TimeEntryFilters {
  project_id?: string;
  from?: string;
  to?: string;
}
