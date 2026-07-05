import { z } from 'zod';
import { USER_ROLES, PROJECT_STATUSES, JOB_STATUSES, NOTE_TYPES, ATTACHMENT_TYPES } from '../types';

// ─── Auth Validation ───────────────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.enum(USER_ROLES as [string, ...string[]]),
});

// ─── Project Validation ────────────────────────────────────────────────────

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(200),
  description: z.string().max(2000).optional(),
  address: z.string().max(500).optional(),
  contact_name: z.string().max(100).optional(),
  contact_phone: z.string().max(20).optional(),
  notes: z.string().max(5000).optional(),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  address: z.string().max(500).optional(),
  contact_name: z.string().max(100).optional(),
  contact_phone: z.string().max(20).optional(),
  notes: z.string().max(5000).optional(),
});

export const updateProjectStatusSchema = z.object({
  status: z.enum(PROJECT_STATUSES as [string, ...string[]]),
});

// ─── Time Entry Validation ─────────────────────────────────────────────────

export const clockInSchema = z.object({
  project_id: z.string().uuid('Invalid project ID'),
  notes: z.string().max(5000).optional(),
});

export const clockOutSchema = z.object({
  notes: z.string().max(5000).optional(),
});

// ─── Schedule Validation ────────────────────────────────────────────────────

export const createScheduleSchema = z.object({
  project_id: z.string().uuid('Invalid project ID'),
  technician_id: z.string().uuid('Invalid technician ID'),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM').optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM').optional(),
  notes: z.string().max(2000).optional(),
  force: z.boolean().optional(),
});

export const updateScheduleSchema = z.object({
  project_id: z.string().uuid('Invalid project ID').optional(),
  technician_id: z.string().uuid('Invalid technician ID').optional(),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM').optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be HH:MM').optional(),
  notes: z.string().max(2000).optional(),
  force: z.boolean().optional(),
});

// ─── Status Transition Validation ──────────────────────────────────────────

export const updateScheduleStatusSchema = z.object({
  status: z.enum(JOB_STATUSES as [string, ...string[]]),
  notes: z.string().max(500).optional(),
});

// ─── Technician Assignment Validation ──────────────────────────────────────

export const assignTechnicianSchema = z.object({
  user_id: z.string().uuid('Invalid user ID'),
});

// ─── Field Data Collection Validation ───────────────────────────────────────

export const createJobNoteSchema = z.object({
  content: z.string().min(1, 'Note content is required').max(5000),
  note_type: z.enum(NOTE_TYPES as [string, ...string[]]).default('technician'),
});

export const createJobAttachmentSchema = z.object({
  attachment_type: z.enum(ATTACHMENT_TYPES as [string, ...string[]]),
});

export const createSignatureSchema = z.object({
  signature_data: z
    .string()
    .min(1, 'Signature data is required')
    .max(524288, 'Signature data exceeds maximum size (512 KiB)'),
  label: z.string().max(100).default('customer'),
});
