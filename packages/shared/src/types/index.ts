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
