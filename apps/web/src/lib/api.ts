import type {
  Project,
  CreateProjectInput,
  UpdateProjectInput,
  ProjectStatus,
  TimeEntry,
  ActiveTimeEntry,
  TimeEntryWithProject,
  TechnicianAssignmentWithDetails,
  User,
  Schedule,
  ScheduleWithDetails,
  CreateScheduleInput,
  UpdateScheduleInput,
  JobStatus,
  AuditLog,
  JobNote,
  CreateJobNoteInput,
  JobAttachment,
  Signature,
  CreateSignatureInput,
  TimeEntryReportRow,
  HoursSummaryRow,
  ProjectSummaryRow,
  DashboardSummary,
  ReportFilters,
} from '@fieldconnect/shared';

/**
 * BFF (Backend-for-Frontend) proxy: calls the Next.js API route which
 * automatically attaches the JWT cookie and re-signs it for Fastify.
 */
async function bffFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `/api/proxy${path}`;

  // Only set Content-Type when there's a body to send
  const hasBody = !!(options.method && options.method !== 'GET' && options.method !== 'HEAD' && options.body);
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (hasBody) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }

  const json = await res.json();
  return json.data as T;
}

// ─── Project API ──────────────────────────────────────────────────────────

export async function getProjects(filters?: {
  status?: ProjectStatus;
  search?: string;
}): Promise<Project[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.search) params.set('search', filters.search);
  const qs = params.toString();
  return bffFetch(`/api/v1/projects${qs ? `?${qs}` : ''}`);
}

export async function getProject(id: string): Promise<Project> {
  return bffFetch(`/api/v1/projects/${id}`);
}

export async function createProject(
  data: CreateProjectInput,
): Promise<Project> {
  return bffFetch('/api/v1/projects', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateProject(
  id: string,
  data: UpdateProjectInput,
): Promise<Project> {
  return bffFetch(`/api/v1/projects/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function updateProjectStatus(
  id: string,
  status: ProjectStatus,
): Promise<Project> {
  return bffFetch(`/api/v1/projects/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

export async function assignTechnician(
  projectId: string,
  userId: string,
): Promise<void> {
  return bffFetch(`/api/v1/projects/${projectId}/assign`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId }),
  });
}

export async function unassignTechnician(
  projectId: string,
  userId: string,
): Promise<void> {
  return bffFetch(`/api/v1/projects/${projectId}/assign/${userId}`, {
    method: 'DELETE',
  });
}

export async function getProjectAssignments(
  projectId: string,
): Promise<any[]> {
  return bffFetch(`/api/v1/projects/${projectId}/assignments`);
}

// ─── Time Entry API ───────────────────────────────────────────────────────

export async function clockIn(
  projectId: string,
  notes?: string,
): Promise<TimeEntry> {
  return bffFetch('/api/v1/time-entries/clock-in', {
    method: 'POST',
    body: JSON.stringify({ project_id: projectId, notes }),
  });
}

export async function clockOut(notes?: string): Promise<TimeEntry> {
  return bffFetch('/api/v1/time-entries/clock-out', {
    method: 'POST',
    body: JSON.stringify({ notes }),
  });
}

export async function getCurrentEntry(): Promise<ActiveTimeEntry | null> {
  return bffFetch('/api/v1/time-entries/current');
}

export async function getTimeEntries(filters?: {
  project_id?: string;
  from?: string;
  to?: string;
}): Promise<TimeEntryWithProject[]> {
  const params = new URLSearchParams();
  if (filters?.project_id) params.set('project_id', filters.project_id);
  if (filters?.from) params.set('from', filters.from);
  if (filters?.to) params.set('to', filters.to);
  const qs = params.toString();
  return bffFetch(`/api/v1/time-entries${qs ? `?${qs}` : ''}`);
}

// ─── Technician API ───────────────────────────────────────────────────────

export async function getMyAssignments(): Promise<
  TechnicianAssignmentWithDetails[]
> {
  return bffFetch('/api/v1/technicians/assignments');
}

export async function getAvailableTechnicians(): Promise<User[]> {
  return bffFetch('/api/v1/technicians/available');
}

export async function getMyJobs(): Promise<ScheduleWithDetails[]> {
  return bffFetch('/api/v1/schedules/my-jobs');
}

// ─── Schedule API ──────────────────────────────────────────────────────────

export async function getSchedules(filters?: {
  date?: string;
  technician_id?: string;
  project_id?: string;
  status?: string;
}): Promise<ScheduleWithDetails[]> {
  const params = new URLSearchParams();
  if (filters?.date) params.set('date', filters.date);
  if (filters?.technician_id) params.set('technician_id', filters.technician_id);
  if (filters?.project_id) params.set('project_id', filters.project_id);
  if (filters?.status) params.set('status', filters.status);
  const qs = params.toString();
  return bffFetch(`/api/v1/schedules${qs ? `?${qs}` : ''}`);
}

export async function getCalendarSchedules(from: string, to: string): Promise<ScheduleWithDetails[]> {
  return bffFetch(`/api/v1/schedules/calendar?from=${from}&to=${to}`);
}

export async function getUnassignedJobs(): Promise<ScheduleWithDetails[]> {
  return bffFetch('/api/v1/schedules/unassigned');
}

export async function getSchedule(id: string): Promise<ScheduleWithDetails> {
  return bffFetch(`/api/v1/schedules/${id}`);
}

export async function createSchedule(data: CreateScheduleInput): Promise<Schedule> {
  return bffFetch('/api/v1/schedules', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateSchedule(id: string, data: UpdateScheduleInput): Promise<Schedule> {
  return bffFetch(`/api/v1/schedules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteSchedule(id: string): Promise<void> {
  return bffFetch(`/api/v1/schedules/${id}`, {
    method: 'DELETE',
  });
}

// ─── Field Data: Job Notes ─────────────────────────────────────────────────

export async function getJobNotes(scheduleId: string): Promise<JobNote[]> {
  return bffFetch(`/api/v1/schedules/${scheduleId}/notes`);
}

export async function addJobNote(
  scheduleId: string,
  data: CreateJobNoteInput,
): Promise<JobNote> {
  return bffFetch(`/api/v1/schedules/${scheduleId}/notes`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ─── Field Data: Attachments ───────────────────────────────────────────────

export async function getJobAttachments(
  scheduleId: string,
): Promise<JobAttachment[]> {
  return bffFetch(`/api/v1/schedules/${scheduleId}/attachments`);
}

export async function uploadJobAttachment(
  scheduleId: string,
  formData: FormData,
): Promise<JobAttachment> {
  const url = `/api/proxy/api/v1/schedules/${scheduleId}/attachments`;

  const res = await fetch(url, {
    method: 'POST',
    body: formData,
    // Do NOT set Content-Type — the browser sets it with the boundary
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Upload failed: ${res.status}`);
  }

  const json = await res.json();
  return json.data as JobAttachment;
}

export async function deleteJobAttachment(
  scheduleId: string,
  attachmentId: string,
): Promise<void> {
  return bffFetch(
    `/api/v1/schedules/${scheduleId}/attachments/${attachmentId}`,
    {
      method: 'DELETE',
    },
  );
}

// ─── Field Data: Signatures ────────────────────────────────────────────────

export async function getJobSignatures(
  scheduleId: string,
): Promise<Signature[]> {
  return bffFetch(`/api/v1/schedules/${scheduleId}/signatures`);
}

export async function addJobSignature(
  scheduleId: string,
  data: CreateSignatureInput,
): Promise<Signature> {
  return bffFetch(`/api/v1/schedules/${scheduleId}/signatures`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateScheduleStatus(
  id: string,
  status: JobStatus,
  notes?: string,
): Promise<{ schedule: ScheduleWithDetails; audit: AuditLog }> {
  return bffFetch(`/api/v1/schedules/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, notes }),
  });
}

// ─── Report API ────────────────────────────────────────────────────────────

export async function getReportTimeEntries(filters?: ReportFilters): Promise<TimeEntryReportRow[]> {
  const params = new URLSearchParams();
  if (filters?.from) params.set('from', filters.from);
  if (filters?.to) params.set('to', filters.to);
  if (filters?.project_id) params.set('project_id', filters.project_id);
  if (filters?.technician_id) params.set('technician_id', filters.technician_id);
  const qs = params.toString();
  return bffFetch(`/api/v1/reports/time-entries${qs ? `?${qs}` : ''}`);
}

export async function getReportTechnicians(filters?: { from?: string; to?: string }): Promise<HoursSummaryRow[]> {
  const params = new URLSearchParams();
  if (filters?.from) params.set('from', filters.from);
  if (filters?.to) params.set('to', filters.to);
  const qs = params.toString();
  return bffFetch(`/api/v1/reports/technicians${qs ? `?${qs}` : ''}`);
}

export async function getReportProjects(filters?: { from?: string; to?: string }): Promise<ProjectSummaryRow[]> {
  const params = new URLSearchParams();
  if (filters?.from) params.set('from', filters.from);
  if (filters?.to) params.set('to', filters.to);
  const qs = params.toString();
  return bffFetch(`/api/v1/reports/projects${qs ? `?${qs}` : ''}`);
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  return bffFetch('/api/v1/dashboard/summary');
}

export function getCsvExportUrl(filters?: ReportFilters): string {
  const params = new URLSearchParams();
  if (filters?.from) params.set('from', filters.from);
  if (filters?.to) params.set('to', filters.to);
  if (filters?.project_id) params.set('project_id', filters.project_id);
  if (filters?.technician_id) params.set('technician_id', filters.technician_id);
  const qs = params.toString();
  return `/api/proxy/api/v1/reports/time-entries.csv${qs ? `?${qs}` : ''}`;
}
