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

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

const PAGE_SIZE = 20;

export function ReportsClient() {
  const [tab, setTab] = useState<Tab>('entries');
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
      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
        <h1 className="mb-1 text-2xl font-bold text-gray-900">Reports</h1>
        <p className="mb-5 text-sm text-gray-500 sm:mb-6">Time reports and summaries</p>

        <div className="mb-5 rounded-xl border border-gray-200 bg-white p-4 sm:mb-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(2,minmax(0,200px))_auto_auto] lg:items-end">
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">From</label>
              <input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">To</label>
              <input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={() => fetchData(1)}
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 lg:w-auto"
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
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50 lg:w-auto"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {downloading ? 'Downloading...' : 'Export Excel'}
            </button>
          </div>
        </div>

        <div className="-mx-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:mx-0">
          <div className="flex min-w-max gap-1 rounded-xl bg-gray-100 p-1 sm:min-w-0 sm:gap-1">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  tab === t.key
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-6 mt-5 rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {loading && (
          <div className="py-12 text-center">
            <p className="text-sm text-gray-400">Loading report...</p>
          </div>
        )}

        {tab === 'entries' && !loading && (
          <div className="mt-5 overflow-hidden rounded-xl border border-gray-200 bg-white">
            {entries.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-gray-400">No time entries found for this period</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[960px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Technician</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Project</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Date</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Clock In</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Clock Out</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-500">Duration</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-500">Break</th>
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Notes</th>
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
                        <td className="max-w-[200px] truncate px-4 py-3 text-gray-500">{entry.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex flex-col gap-3 border-t border-gray-200 bg-gray-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-gray-500">
                    Showing page {entryPagination.page} of {entryPagination.total_pages} ({entryPagination.total} entries)
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => fetchData(entryPagination.page - 1)}
                      disabled={entryPagination.page <= 1 || loading}
                      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => fetchData(entryPagination.page + 1)}
                      disabled={entryPagination.page >= entryPagination.total_pages || loading}
                      className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'technicians' && !loading && (
          <div className="mt-5 overflow-hidden rounded-xl border border-gray-200 bg-white">
            {technicians.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-gray-400">No technician hours found for this period</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[520px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Technician</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-500">Total Hours</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-500">Entries</th>
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

        {tab === 'projects' && !loading && (
          <div className="mt-5 overflow-hidden rounded-xl border border-gray-200 bg-white">
            {projects.length === 0 ? (
              <div className="py-12 text-center">
                <p className="text-sm text-gray-400">No project hours found for this period</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[560px] w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50">
                      <th className="px-4 py-3 text-left font-medium text-gray-500">Project</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-500">Total Hours</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-500">Entries</th>
                      <th className="px-4 py-3 text-right font-medium text-gray-500">Technicians</th>
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