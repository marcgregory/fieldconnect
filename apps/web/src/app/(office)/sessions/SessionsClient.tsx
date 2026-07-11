'use client';

import { useState, useEffect, useCallback } from 'react';

interface Session {
  id: string;
  label: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}

export function SessionsClient() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch('/api/proxy/api/v1/auth/sessions');

      if (!res.ok) {
        throw new Error('Failed to load sessions');
      }

      const data = await res.json();
      setSessions(data.sessions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const revokeSession = async (id: string) => {
    setRevokingId(id);
    try {
      const res = await fetch(`/api/proxy/api/v1/auth/sessions/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to revoke session');

      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke session');
    } finally {
      setRevokingId(null);
    }
  };

  const revokeAll = async () => {
    if (!confirm('This will log out all your devices. Continue?')) return;
    setRevokingAll(true);
    try {
      const res = await fetch('/api/proxy/api/v1/auth/logout-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) throw new Error('Failed to revoke all sessions');

      setSessions((prev) => prev.filter((s) => s.current));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to revoke all sessions');
    } finally {
      setRevokingAll(false);
    }
  };

  function formatDate(dateStr: string): string {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString();
  }

  function formatUserAgent(ua: string | null): string {
    if (!ua) return 'Unknown device';
    // Simplify common user agent strings
    if (ua.includes('Chrome') && ua.includes('Edg/')) return 'Microsoft Edge';
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari') && !ua.includes('Chrome')) return 'Safari';
    if (ua.includes('SamsungBrowser')) return 'Samsung Internet';
    if (ua.includes('OPR') || ua.includes('Opera')) return 'Opera';
    // Truncate long strings
    return ua.length > 60 ? ua.slice(0, 60) + '...' : ua;
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Sessions</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage your active login sessions and devices.
          </p>
        </div>
        {sessions.length > 1 && (
          <button
            onClick={revokeAll}
            disabled={revokingAll}
            className="rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {revokingAll ? 'Revoking...' : 'Log out all devices'}
          </button>
        )}
      </div>

      {error && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-brand-600" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center">
          <p className="text-slate-500">No active sessions.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`rounded-2xl border bg-white p-5 transition-shadow hover:shadow-sm ${
                s.current
                  ? 'border-brand-200 ring-1 ring-brand-100'
                  : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-900">
                      {formatUserAgent(s.userAgent)}
                    </h3>
                    {s.current && (
                      <span className="inline-flex items-center rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-700">
                        Current
                      </span>
                    )}
                  </div>
                  <div className="mt-2 space-y-1 text-sm text-slate-500">
                    {s.ipAddress && (
                      <p>
                        <span className="font-medium text-slate-600">IP:</span>{' '}
                        {s.ipAddress}
                      </p>
                    )}
                    <p>
                      <span className="font-medium text-slate-600">Last active:</span>{' '}
                      {formatDate(s.lastUsedAt)}
                    </p>
                    <p>
                      <span className="font-medium text-slate-600">Created:</span>{' '}
                      {new Date(s.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>

                {!s.current && (
                  <button
                    onClick={() => revokeSession(s.id)}
                    disabled={revokingId === s.id}
                    className="shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {revokingId === s.id ? 'Revoking...' : 'Revoke'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
