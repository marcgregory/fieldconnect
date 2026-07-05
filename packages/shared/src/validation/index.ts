import { z } from 'zod';
import { USER_ROLES, PROJECT_STATUSES } from '../types';

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

// ─── Technician Assignment Validation ──────────────────────────────────────

export const assignTechnicianSchema = z.object({
  user_id: z.string().uuid('Invalid user ID'),
});
