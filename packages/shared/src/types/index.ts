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
  /**
   * ISO timestamp when the user verified their email. Null until the user
   * completes the email verification flow (Sprint 6, Phase 2). Set to null
   * again on email change (future phase).
   */
  email_verified_at: string | null;
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

export type GeofenceAction = 'warning' | 'block_clock_in' | 'require_override';

export const GEOFENCE_ACTIONS: GeofenceAction[] = [
  'warning',
  'block_clock_in',
  'require_override',
];

export type GeofenceStatus = 'inside' | 'outside' | 'unavailable';

export interface GeofenceResult {
  distance_meters: number | null;
  inside_geofence: GeofenceStatus;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  geofence_radius: number;
  geofence_action: GeofenceAction;
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
  latitude?: number;
  longitude?: number;
  geofence_radius?: number;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  address?: string;
  contact_name?: string;
  contact_phone?: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
  geofence_radius?: number;
}

// ─── Time Entry ────────────────────────────────────────────────────────────

export type ClockInGpsStatus = 'captured' | 'permission_denied' | 'timeout' | 'position_unavailable' | 'unsupported' | 'omitted';

export interface TimeEntry {
  id: string;
  user_id: string;
  project_id: string;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  notes: string | null;
  clock_in_lat: number | null;
  clock_in_lng: number | null;
  clock_in_accuracy: number | null;
  clock_in_gps_status: ClockInGpsStatus | null;
  clock_in_gps_error: string | null;
  clock_out_lat: number | null;
  clock_out_lng: number | null;
  clock_out_accuracy: number | null;
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

/** Extended time entry returned from clock-in/out with geofence info */
export interface TimeEntryWithGeofence extends TimeEntry {
  distance_from_site: number | null;
  inside_geofence: 'inside' | 'outside' | 'unavailable';
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
  project_status: ProjectStatus;
  technician_name: string;
  technician_role: string;
  project_latitude?: number | null;
  project_longitude?: number | null;
  project_geofence_radius?: number;
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
  clock_in_lat?: number;
  clock_in_lng?: number;
}

// ─── Schedule / Job Status ──────────────────────────────────────────────────

export type JobStatus = 'scheduled' | 'traveling' | 'on_site' | 'completed' | 'closed' | 'rework_required';

export const JOB_STATUSES: JobStatus[] = [
  'scheduled',
  'traveling',
  'on_site',
  'completed',
  'closed',
  'rework_required',
];

export interface Schedule {
  id: string;
  project_id: string;
  /** @deprecated Use technician_ids array from ScheduleWithDetails */
  technician_id?: string;
  scheduled_date: string;
  start_time: string | null;
  end_time: string | null;
  status: JobStatus;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TechnicianWorkflowStatus {
  technician_id: string;
  technician_name: string;
  status: JobStatus;
  completed_at: string | null;
  closed_at: string | null;
  current_rework_version: number;
  has_open_rework: boolean;
}

export interface ScheduleWithDetails extends Schedule {
  project_name: string;
  project_address: string | null;
  project_contact_name: string | null;
  project_contact_phone: string | null;
  /** Comma-separated technician names for display */
  technician_name: string;
  /** Array of assigned technician IDs (many-to-many) */
  technician_ids: string[];
  /** Array of assigned technician names (order matches ids) */
  technician_names: string[];
  /** Per-technician workflow status (authoritative per-tech state) */
  technician_workflow: TechnicianWorkflowStatus[];
  note_count?: number;
  attachment_count?: number;
  signature_count?: number;
  project_latitude?: number | null;
  project_longitude?: number | null;
  project_geofence_radius?: number;
  /** GPS coordinates from the technician's clock-in on this job's day */
  clock_in_lat?: number | null;
  clock_in_lng?: number | null;
  clock_in_accuracy?: number | null;
  clock_in_time?: string | null;
  /** @deprecated Use technician_workflow[i].current_rework_version instead */
  current_rework_version?: number;
  /** @deprecated Use technician_workflow[i].has_open_rework instead */
  has_open_rework?: boolean;
}

export interface CreateScheduleInput {
  project_id: string;
  /** Array of technician IDs to assign to this schedule */
  technician_ids: string[];
  scheduled_date: string;
  start_time?: string;
  end_time?: string;
  notes?: string;
  force?: boolean;
}

export interface UpdateScheduleInput {
  start_time?: string;
  end_time?: string;
  notes?: string;
  /** Array of technician IDs to assign to this schedule */
  technician_ids?: string[];
  scheduled_date?: string;
  force?: boolean;
}

export interface ConflictSchedule {
  project_name: string;
  start_time: string;
  end_time: string;
}

export interface TechnicianAvailability {
  id: string;
  email: string;
  name: string;
  role: string;
  availability: 'available' | 'busy' | 'buffer_conflict';
  conflict_schedule: ConflictSchedule | null;
}

export interface UpdateScheduleStatusInput {
  status: JobStatus;
  notes?: string;
}

// ─── Rework Request ───────────────────────────────────────────────────────────

export type ReworkStatus = 'open' | 'completed';

export interface ReworkRequest {
  id: string;
  schedule_id: string;
  technician_id: string;
  technician_name?: string;
  rework_version: number;
  reason: string;
  requested_by: string;
  requested_by_name?: string;
  requested_at: string;
  resumed_at: string | null;
  resolved_at: string | null;
  status: ReworkStatus;
  created_at: string;
}

export interface CreateReworkInput {
  reason: string;
}

// ─── Audit Log ──────────────────────────────────────────────────────────────

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

export interface AuthAuditEvent {
  id: string;
  user_id: string | null;
  action: string;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
  user_name: string | null;
  user_email: string | null;
}

// ─── Field Data Collection ──────────────────────────────────────────────────

export type NoteType = 'technician' | 'internal';

export const NOTE_TYPES: NoteType[] = ['technician', 'internal'];

export type AttachmentType = 'before' | 'during' | 'after' | 'document';

export const ATTACHMENT_TYPES: AttachmentType[] = [
  'before',
  'during',
  'after',
  'document',
];

export interface JobNote {
  id: string;
  schedule_id: string;
  user_id: string;
  user_name: string;
  content: string;
  note_type: NoteType;
  rework_version: number;
  created_at: string;
  /** Which technician this evidence belongs to (NULL for legacy or office-submitted) */
  technician_id?: string | null;
}

export interface CreateJobNoteInput {
  content: string;
  note_type?: NoteType;
  /** For internal notes added from a specific technician's review card */
  technician_id?: string;
}

export interface JobAttachment {
  id: string;
  schedule_id: string;
  user_id: string;
  user_name: string;
  file_name: string;
  file_path: string;
  mime_type: string;
  file_size: number;
  attachment_type: AttachmentType;
  rework_version: number;
  created_at: string;
  /** Which technician this evidence belongs to (NULL for legacy or office-submitted) */
  technician_id?: string | null;
  cloudinary_public_id?: string;
  secure_url?: string;
  resource_type?: string;
  /** GPS latitude at capture time */
  latitude?: number | null;
  /** GPS longitude at capture time */
  longitude?: number | null;
  /** GPS accuracy in meters */
  accuracy?: number | null;
  /** When the photo was taken (may differ from upload time) */
  captured_at?: string | null;
  /** Distance from project site in meters (computed at upload) */
  distance_from_site?: number | null;
  /** Whether the photo was taken inside the geofence */
  inside_geofence?: boolean | null;
  /** Cloudinary image width in pixels */
  width?: number | null;
  /** Cloudinary image height in pixels */
  height?: number | null;
  /** Cloudinary image format (jpg, png, webp) */
  format?: string | null;
}

export interface CreateJobAttachmentInput {
  attachment_type: AttachmentType;
}

export interface Signature {
  id: string;
  schedule_id: string;
  user_id: string;
  user_name: string;
  signature_data: string;
  label: string;
  rework_version: number;
  created_at: string;
  /** Which technician this evidence belongs to (NULL for legacy or office-submitted) */
  technician_id?: string | null;
  cloudinary_public_id?: string;
  secure_url?: string;
}

export interface CreateSignatureInput {
  signature_data: string;
  label?: string;
}

// ─── Job Event (WebSocket payload) ──────────────────────────────────────────

export interface JobEvent {
  type: 'status_change' | 'assignment' | 'reassigned';
  schedule_id: string;
  project_name: string;
  technician_name: string;
  old_status: JobStatus | null;
  new_status: JobStatus;
  changed_by: string;
  timestamp: string;
  technician_id?: string; // target technician for targeted delivery
}

// ─── Note Event (WebSocket payload) ─────────────────────────────────────────

export interface NoteEvent {
  type: 'note_added';
  schedule_id: string;
  project_name: string;
  user_name: string;
  note_type: string;
  timestamp: string;
  technician_id: string;
  technician_name?: string;
}

// ─── Attachment Event (WebSocket payload) ───────────────────────────────────

export interface AttachmentEvent {
  type: 'attachment_uploaded' | 'attachment_deleted';
  schedule_id: string;
  project_name: string;
  user_name: string;
  attachment_id: string;
  file_name: string;
  attachment_type: string;
  timestamp: string;
  technician_id: string;
}

// ─── Signature Event (WebSocket payload) ────────────────────────────────────

export interface SignatureEvent {
  type: 'signature_captured';
  schedule_id: string;
  project_name: string;
  user_name: string;
  label: string;
  timestamp: string;
  technician_id: string;
}

// ─── Union type for all real-time field events ──────────────────────────────

export type FieldEvent = JobEvent | NoteEvent | AttachmentEvent | SignatureEvent;

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

// ─── Report Types ──────────────────────────────────────────────────────────

export interface TimeEntryReportRow {
  id: string;
  technician_id: string;
  technician_name: string;
  project_id: string;
  project_name: string;
  project_address: string | null;
  scheduled_date: string | null;
  clock_in: string;
  clock_out: string | null;
  break_minutes: number;
  duration_hours: number;
  notes: string | null;
}

export interface HoursSummaryRow {
  technician_id: string;
  technician_name: string;
  total_hours: number;
  entry_count: number;
}

export interface ProjectSummaryRow {
  project_id: string;
  project_name: string;
  total_hours: number;
  entry_count: number;
  technician_count: number;
}

export interface DashboardSummary {
  hours_this_week: number;
  active_technicians: number;
  completed_today: number;
  needs_review_count: number;
  late_jobs_count: number;
}

// ─── Review Queue (per-technician) ────────────────────────────────────────────

export interface ReviewItem {
  schedule_id: string;
  technician_id: string;
  technician_name: string;
  status: JobStatus;
  completed_at: string | null;
  closed_at: string | null;
  // Schedule/project info
  project_id: string;
  project_name: string;
  project_address: string | null;
  scheduled_date: string;
  start_time: string | null;
  end_time: string | null;
  project_latitude: number | null;
  project_longitude: number | null;
  project_geofence_radius: number;
  // Clock-in GPS from this technician
  clock_in_lat: number | null;
  clock_in_lng: number | null;
  clock_in_accuracy: number | null;
  clock_in_time: string | null;
  clock_in_gps_status: string | null;
  clock_in_gps_error: string | null;
  // Per-tech evidence counts
  note_count: number;
  attachment_count: number;
  signature_count: number;
  // Per-type attachment counts for collapsed checklist accuracy
  before_photo_count: number;
  during_photo_count: number;
  after_photo_count: number;
  document_count: number;
  // Rework
  current_rework_version: number;
  has_open_rework: boolean;
  // Other technicians on this same schedule (for display context)
  other_technicians: Array<{
    technician_id: string;
    technician_name: string;
    status: JobStatus;
  }>;
}

export interface ReportFilters {
  from?: string;
  to?: string;
  project_id?: string;
  technician_id?: string;
}
