'use client';

import { useState, useEffect, useCallback } from 'react';
import type { AuthAuditEvent } from '@fieldconnect/shared';
import { useSocket } from '@/hooks/useSocket';

type AuditEvent = AuthAuditEvent;

const ACTION_LABELS: Record<string, string> = {
  verification_email_sent: 'Verification Email Sent',
  verification_email_resent: 'Verification Email Resent',
  email_verified: 'Email Verified',
  verification_failed: 'Verification Failed',
  login_blocked_unverified: 'Login Blocked (Unverified)',
  password_reset_requested: 'Password Reset Requested',
  password_reset_completed: 'Password Reset Completed',
  password_reset_failed: 'Password Reset Failed',
  password_changed_notification_sent: 'Password Changed Notification',
  login_failed: 'Login Failed',
  login_rate_limited: 'Login Rate Limited',
  account_temporarily_locked: 'Account Temporarily Locked',
  login_blocked_locked: 'Login Blocked (Locked)',
  login_success: 'Login Success',
  lockout_cleared: 'Lockout Cleared',
  session_created: 'Session Created',
  token_refreshed: 'Token Refreshed',
  refresh_token_reuse_detected: 'Refresh Token Reuse Detected',
  session_revoked: 'Session Revoked',
  logout: 'Logout',
  logout_all: 'Logout All',
  all_sessions_revoked: 'All Sessions Revoked',
};

function getActionBadge(action: string): {
  label: string;
  variant: 'green' | 'red' | 'yellow' | 'blue' | 'neutral';
} {
  const label = ACTION_LABELS[action] || action.replace(/_/g, ' ');
  if (
    action === 'login_success' ||
    action === 'email_verified' ||
    action === 'password_reset_completed' ||
    action === 'session_created'
  ) {
    return { label, variant: 'green' };
  }
  if (
    action === 'login_failed' ||
    action === 'login_blocked_unverified' ||
    action === 'login_blocked_locked' ||
    action === 'login_rate_limited' ||
    action === 'account_temporarily_locked' ||
    action === 'refresh_token_reuse_detected'
  ) {
    return { label, variant: 'red' };
  }
  if (
    action === 'verification_email_sent' ||
    action === 'verification_email_resent' ||
    action === 'password_reset_requested'
  ) {
    return { label, variant: 'yellow' };
  }
  return { label, variant: 'blue' };
}

const VARIANT_CLASSES: Record<string, string> = {
  green: 'bg-green-100 text-green-700',
  red: 'bg-red-100 text-red-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  blue: 'bg-blue-100 text-blue-700',
  neutral: 'bg-slate-100 text-slate-700',
};

export function AuditClient() {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [actions, setActions] = useState<string[]>([]);
  const [filterAction, setFilterAction] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');
  const PER_PAGE = 50;
  const { onAuthAudit } = useSocket();

  const fetchActions = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/api/v1/auth/audit-logs/actions');
      if (res.ok) {
        const data = await res.json();
        setActions(data.actions || []);
      }
    } catch {
    }
  }, []);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams({
        limit: String(PER_PAGE),
        offset: String(page * PER_PAGE),
      });
      if (filterAction) params.set('action', filterAction);
      if (filterDateFrom) params.set('dateFrom', filterDateFrom);
      if (filterDateTo) params.set('dateTo', filterDateTo);

      const res = await fetch(`/api/proxy/api/v1/auth/audit-logs?${params}`);

      if (!res.ok) {
        if (res.status === 403) throw new Error('Access denied. Admin role required.');
        throw new Error('Failed to load audit logs');
      }

      const data = await res.json();
      setEvents(data.events || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [page, filterAction, filterDateFrom, filterDateTo]);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const eventMatchesFilters = useCallback((event: AuditEvent): boolean => {
    if (filterAction && event.action !== filterAction) return false;

    const eventTime = new Date(event.created_at).getTime();
    if (filterDateFrom && eventTime < new Date(filterDateFrom).getTime()) return false;
    if (filterDateTo && eventTime > new Date(filterDateTo).getTime()) return false;

    return true;
  }, [filterAction, filterDateFrom, filterDateTo]);

  useEffect(() => {
    return onAuthAudit((event) => {
      fetchActions();
      if (!eventMatchesFilters(event)) return;

      setTotal((prev) => prev + 1);
      if (page !== 0) return;

      setEvents((prev) => [
        event,
        ...prev.filter((existing) => existing.id !== event.id),
      ].slice(0, PER_PAGE));
    });
  }, [eventMatchesFilters, fetchActions, onAuthAudit, page]);

  const handleFilter = () => {
    setPage(0);
    fetchEvents();
  };

  const totalPages = Math.ceil(total / PER_PAGE);

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  function formatIp(ip: string | null): string {
    if (!ip) return '—';
    return ip;
  }

  function formatUser(userName: string | null, userEmail: string | null): string {
    if (userName && userEmail) return `${userName} (${userEmail})`;
    if (userName) return userName;
    if (userEmail) return userEmail;
    return 'Unknown';
  }

  function formatMetadata(meta: Record<string, unknown> | null): string {
    if (!meta) return '';
    const entries = Object.entries(meta).filter(([_, v]) => v !== null && v !== undefined && v !== '');
    if (entries.length === 0) return '';
    return entries.map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' • ');
  }

  return (
    <div className="mx-auto max-w-6xl px-3 py-4 sm:px-4 sm:py-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Audit Log</h1>
        <p className="mt-1 text-sm text-slate-500">
          Authentication and security events across the platform.
        </p>
      </div>

      {error && (
        <div
          className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          role="alert"
        >
          {error}
        </div>
      )}

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_repeat(2,minmax(200px,1fr))_auto]">
          <div className="min-w-0">
            <label htmlFor="action-filter" className="mb-1 block text-xs font-medium text-slate-500">
              Action
            </label>
            <select
              id="action-filter"
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              <option value="">All actions</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {ACTION_LABELS[a] || a.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="date-from" className="mb-1 block text-xs font-medium text-slate-500">
              From
            </label>
            <input
              id="date-from"
              type="datetime-local"
              value={filterDateFrom}
              onChange={(e) => setFilterDateFrom(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <div>
            <label htmlFor="date-to" className="mb-1 block text-xs font-medium text-slate-500">
              To
            </label>
            <input
              id="date-to"
              type="datetime-local"
              value={filterDateTo}
              onChange={(e) => setFilterDateTo(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
          <button
            onClick={handleFilter}
            className="w-full rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 xl:w-auto xl:self-end"
          >
            Apply
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-brand-600" />
        </div>
      ) : events.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <p className="text-slate-500">No audit events found.</p>
        </div>
      ) : (
        <>
          <div className="mb-3 text-sm text-slate-500">
            Showing {page * PER_PAGE + 1}–{Math.min((page + 1) * PER_PAGE, total)} of {total} events
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="overflow-x-auto overscroll-x-contain">
              <table className="min-w-[920px] w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="px-4 py-3 font-semibold text-slate-600">Time</th>
                    <th className="px-4 py-3 font-semibold text-slate-600">Action</th>
                    <th className="px-4 py-3 font-semibold text-slate-600">User</th>
                    <th className="px-4 py-3 font-semibold text-slate-600">IP</th>
                    <th className="px-4 py-3 font-semibold text-slate-600">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {events.map((e) => {
                    const { label, variant } = getActionBadge(e.action);
                    return (
                      <tr key={e.id} className="hover:bg-slate-50/50">
                        <td className="whitespace-nowrap px-4 py-3 text-slate-500">
                          {formatDate(e.created_at)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${VARIANT_CLASSES[variant]}`}>
                            {label}
                          </span>
                        </td>
                        <td className="max-w-[220px] truncate px-4 py-3 text-slate-700">
                          {formatUser(e.user_name, e.user_email)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500">
                          {formatIp(e.ip_address)}
                        </td>
                        <td className="max-w-[280px] truncate px-4 py-3 text-xs text-slate-400">
                          {formatMetadata(e.metadata)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
              >
                Previous
              </button>
              <span className="px-2 text-sm text-slate-500">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}