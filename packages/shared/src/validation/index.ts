import { z } from 'zod';
import { USER_ROLES, PROJECT_STATUSES, JOB_STATUSES, NOTE_TYPES, ATTACHMENT_TYPES } from '../types';

// ─── Auth Validation ───────────────────────────────────────────────────────

export const PASSWORD_MIN = 8;

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  password: z
    .string()
    .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`),
  role: z.enum(USER_ROLES as [string, ...string[]]),
});

/**
 * Resend verification email. Only the email is needed — the server looks up
 * the user. The endpoint always returns 200 to prevent email-enumeration; if
 * the user is missing or already verified, no email is sent and no audit row
 * is written.
 */
export const resendVerificationSchema = z.object({
  email: z.string().email('Invalid email address'),
});

// ─── Phase 3 — Password Reset / Change Password (schemas only this turn) ───
// The pages and API endpoints land in a follow-up change. The schemas are
// exported here so the API and the future pages share one source of truth.

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
});

/**
 * API-facing schema for the POST /api/v1/auth/reset-password endpoint.
 * `token` comes from the URL; `password` is the new password chosen by the user.
 */
export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z
    .string()
    .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`),
});

/**
 * Client-facing form schema. Extends the API schema with a confirm-password
 * field so the form can validate that the two entries match before sending.
 */
export const resetPasswordFormSchema = z
  .object({
    password: z
      .string()
      .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`),
    confirmPassword: z
      .string()
      .min(1, 'Please confirm your new password'),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(PASSWORD_MIN, `Password must be at least ${PASSWORD_MIN} characters`),
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: 'New password must be different from the current password',
    path: ['newPassword'],
  });

// ─── Project Validation ────────────────────────────────────────────────────

export const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(200),
  description: z.string().max(2000).optional(),
  address: z.string().max(500).optional(),
  contact_name: z.string().max(100).optional(),
  contact_phone: z.string().max(20).optional(),
  notes: z.string().max(5000).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  geofence_radius: z.number().int().min(0).max(10000).default(50),
});

export const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  address: z.string().max(500).optional(),
  contact_name: z.string().max(100).optional(),
  contact_phone: z.string().max(20).optional(),
  notes: z.string().max(5000).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  geofence_radius: z.number().int().min(0).max(10000).optional(),
});

export const updateProjectStatusSchema = z.object({
  status: z.enum(PROJECT_STATUSES as [string, ...string[]]),
});

// ─── Time Entry Validation ─────────────────────────────────────────────────

const latSchema = z.number().min(-90).max(90).optional();
const lngSchema = z.number().min(-180).max(180).optional();
const accuracySchema = z.number().min(0).max(10000).optional();

export const clockInSchema = z.object({
  project_id: z.string().uuid('Invalid project ID'),
  notes: z.string().max(5000).optional(),
  clock_in_lat: latSchema,
  clock_in_lng: lngSchema,
  clock_in_accuracy: accuracySchema,
  geofence_override: z.boolean().optional(),
});

export const clockOutSchema = z.object({
  notes: z.string().max(5000).optional(),
  clock_out_lat: latSchema,
  clock_out_lng: lngSchema,
  clock_out_accuracy: accuracySchema,
});

// ─── Schedule Validation ────────────────────────────────────────────────────

const timeStringRegex = /^\d{2}:\d{2}$/;
const BUSINESS_HOURS_START = '06:00';

function isTimeBefore(a: string, b: string): boolean {
  return a < b;
}

export const createScheduleSchema = z.object({
  project_id: z.string().uuid('Invalid project ID'),
  technician_ids: z.array(z.string().uuid('Invalid technician ID')).min(1, 'At least one technician required'),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  start_time: z.string().regex(timeStringRegex, 'Time must be HH:MM').optional(),
  end_time: z.string().regex(timeStringRegex, 'Time must be HH:MM').optional(),
  notes: z.string().max(2000).optional(),
  force: z.boolean().optional(),
}).refine(
  (data) => {
    if (!data.start_time) return true;
    return !isTimeBefore(data.start_time, BUSINESS_HOURS_START);
  },
  { message: 'Schedules cannot start before 6:00 AM.', path: ['start_time'] },
).refine(
  (data) => {
    if (!data.start_time || !data.end_time) return true;
    return data.end_time > data.start_time;
  },
  { message: 'End time must be after start time.', path: ['end_time'] },
);

export const updateScheduleSchema = z.object({
  project_id: z.string().uuid('Invalid project ID').optional(),
  technician_ids: z.array(z.string().uuid('Invalid technician ID')).min(1, 'At least one technician required').optional(),
  scheduled_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD').optional(),
  start_time: z.string().regex(timeStringRegex, 'Time must be HH:MM').optional(),
  end_time: z.string().regex(timeStringRegex, 'Time must be HH:MM').optional(),
  notes: z.string().max(2000).optional(),
  force: z.boolean().optional(),
}).refine(
  (data) => {
    if (!data.start_time) return true;
    return !isTimeBefore(data.start_time, BUSINESS_HOURS_START);
  },
  { message: 'Schedules cannot start before 6:00 AM.', path: ['start_time'] },
).refine(
  (data) => {
    if (!data.start_time || !data.end_time) return true;
    return data.end_time > data.start_time;
  },
  { message: 'End time must be after start time.', path: ['end_time'] },
);

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
  rework_version: z.number().int().min(0).default(0),
});

export const createReworkSchema = z.object({
  reason: z.string().min(1, 'Reason is required').max(1000),
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
