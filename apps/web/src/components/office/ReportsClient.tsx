'use client';

import { useState, useEffect, useCallback } from 'react';
import { getReportTimeEntries, getReportTechnicians, getReportProjects, getExcelExportUrl } from '@/lib/api';
import type { TimeEntryReportRow, HoursSummaryRow, ProjectSummaryRow } from '@fieldconnect/shared';
import { useHasMounted } from '@/hooks/useHasMounted';

type Tab = 'entries' | 'technicians' | 'projects';

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const PAGE_SIZE = 20;

export function ReportsClient() {
  const [tab, setTab] = useState<Tab>('entries');
  // Initialize with a stable default date to avoid hydration mismatch.
  // The real default is set after mount via useEffect.
  const [from, setFrom] = useState('1970-01-01');
  const [to, setTo] = useState('1970-01-01');
  const mounted = useHasMounted();
  useEffect(() => {
    if (mounted) {
      const d = new Date();
      setTo(d.toISOString().split('T')[0]);
      d.setDate(d.getDate() - 7);
      setFrom(d.toISOString().split('T')[0]);
    }
  }, [mounted]);

  // Time entries
  const [entries, setEntries] = useState<TimeEntryReportRow[]>([]);
  const [entryPagination, setEntryPagination] = useState({ page: 1, total: 0, total_pages: 0 });
  const [technicians, setTechnicians] = useState<HoursSummaryRow[]>([]);
  const [projects, setProjects] = useState<ProjectSummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  const tz = typeof window !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : 'UTC';

  const fetchData = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');
    try {
      switch (tab) {
        case 'entries': {
          const result = await getReportTimeEntries({ from, to, tz, page, limit: PAGE_SIZE });
          setEntries(result.data);
          setEntryPagination({ page: result.pagination.page, total: result.pagination.total, total_pages: result.pagination.total_pages });
          break;
        }
        case 'technicians': {
          const data = await getReportTechnicians({ from, to });
          setTechnicians(data);
          break;
        }
        case 'projects': {
          const data = await getReportProjects({ from, to });
          setProjects(data);
          break;
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report');
    } finally {
      setLoading(false);
    }
  }, [tab, from, to, tz]);

  useEffect(() => {
    fetchData(1);
  }, [fetchData]);

  const excelUrl = getExcelExportUrl({ from, to, tz });

  const tabs: { key: Tab; label: string }[] = [
    { key: 'entries', label: 'Time Entries' },
    { key: 'technicians', label: 'By Technician' },
    { key: 'projects', label: 'By Project' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Reports</h1>
        <p className="text-sm text-gray-500 mb-6">Time reports and summaries</p>

        {/* Date Filters */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
          <div className="flex items-end gap-4 flex-wrap">
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={() => fetchData(1)}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Apply'}
            </button>
            <button
              type="button"
              onClick={async () => {
                if (downloading) return;
                setDownloading(true);
                try {
                  const res = await fetch(excelUrl, { credentials: 'include' });
                  if (!res.ok) { alert('Failed to download Excel'); setDownloading(false); return; }
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `time-entries-${from||'all'}-${to||'all'}.xls`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                } catch { alert('Failed to download Excel'); }
                finally { setDownloading(false); }
              }}
              disabled={downloading}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {downloading ? 'Downloading...' : 'Export Excel'}
            </button>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-6">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                tab === t.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <p className="text-red-700 text-sm">{error}</p>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-12">
            <p className="text-sm text-gray-400">Loading report...</p>
          </div>
        )}

        {/* Time Entries Table */}
        {tab === 'entries' && !loading && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {entries.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-gray-400">No time entries found for this period</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Technician</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Project</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Date</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Clock In</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Clock Out</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">Duration</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">Break</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((entry) => (
                      <tr key={entry.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{entry.technician_name}</td>
                        <td className="px-4 py-3 text-gray-700">{entry.project_name}</td>
                        <td className="px-4 py-3 text-gray-500">{entry.scheduled_date ? formatDate(entry.scheduled_date) : formatDate(entry.clock_in)}</td>
                        <td className="px-4 py-3 text-gray-700">{formatDateTime(entry.clock_in)}</td>
                        <td className="px-4 py-3 text-gray-700">{entry.clock_out ? formatDateTime(entry.clock_out) : '—'}</td>
                        <td className="px-4 py-3 text-right font-medium">{entry.duration_hours}h</td>
                        <td className="px-4 py-3 text-right text-gray-500">{entry.break_minutes}m</td>
                        <td className="px-4 py-3 text-gray-500 max-w-[200px] truncate">{entry.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {/* Pagination */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                  <p className="text-sm text-gray-500">
                    Showing page {entryPagination.page} of {entryPagination.total_pages} ({entryPagination.total} entries)
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => fetchData(entryPagination.page - 1)}
                      disabled={entryPagination.page <= 1 || loading}
                      className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => fetchData(entryPagination.page + 1)}
                      disabled={entryPagination.page >= entryPagination.total_pages || loading}
                      className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-100"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* By Technician */}
        {tab === 'technicians' && !loading && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {technicians.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-gray-400">No technician hours found for this period</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Technician</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">Total Hours</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">Entries</th>
                    </tr>
                  </thead>
                  <tbody>
                    {technicians.map((row) => (
                      <tr key={row.technician_id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{row.technician_name}</td>
                        <td className="px-4 py-3 text-right font-medium">{row.total_hours}h</td>
                        <td className="px-4 py-3 text-right text-gray-500">{row.entry_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* By Project */}
        {tab === 'projects' && !loading && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {projects.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-sm text-gray-400">No project hours found for this period</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Project</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">Total Hours</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">Entries</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">Technicians</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((row) => (
                      <tr key={row.project_id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900">{row.project_name}</td>
                        <td className="px-4 py-3 text-right font-medium">{row.total_hours}h</td>
                        <td className="px-4 py-3 text-right text-gray-500">{row.entry_count}</td>
                        <td className="px-4 py-3 text-right text-gray-500">{row.technician_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

