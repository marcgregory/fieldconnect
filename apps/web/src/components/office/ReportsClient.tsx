'use client';

import { useState, useEffect, useCallback } from 'react';
import { getReportTimeEntries, getReportTechnicians, getReportProjects, getCsvExportUrl } from '@/lib/api';
import type { TimeEntryReportRow, HoursSummaryRow, ProjectSummaryRow } from '@fieldconnect/shared';

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
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function ReportsClient() {
  const [tab, setTab] = useState<Tab>('entries');
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [to, setTo] = useState(() => new Date().toISOString().split('T')[0]);

  // Time entries
  const [entries, setEntries] = useState<TimeEntryReportRow[]>([]);
  const [technicians, setTechnicians] = useState<HoursSummaryRow[]>([]);
  const [projects, setProjects] = useState<ProjectSummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      switch (tab) {
        case 'entries': {
          const data = await getReportTimeEntries({ from, to });
          setEntries(data);
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
  }, [tab, from, to]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const csvUrl = getCsvExportUrl({ from, to });

  const tabs: { key: Tab; label: string }[] = [
    { key: 'entries', label: 'Time Entries' },
    { key: 'technicians', label: 'By Technician' },
    { key: 'projects', label: 'By Project' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500">Time reports and summaries</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
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
              onClick={fetchData}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Apply'}
            </button>
            <a
              href={csvUrl}
              className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors inline-flex items-center gap-1.5"
              download
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export CSV
            </a>
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
