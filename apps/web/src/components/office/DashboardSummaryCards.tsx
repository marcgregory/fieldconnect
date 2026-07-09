'use client';

import { useState, useEffect, useCallback } from 'react';
import { getDashboardSummary } from '@/lib/api';
import { useSocket } from '@/hooks/useSocket';
import type { DashboardSummary } from '@fieldconnect/shared';

type CardTone = 'amber' | 'emerald' | 'teal' | 'slate' | 'red';

const toneStyles: Record<CardTone, string> = {
  amber: 'from-brand-50 to-white text-brand-800 border-brand-200',
  emerald: 'from-emerald-50 to-white text-emerald-800 border-emerald-200',
  teal: 'from-teal-50 to-white text-teal-800 border-teal-200',
  slate: 'from-slate-100 to-white text-slate-700 border-slate-200',
  red: 'from-red-50 to-white text-red-700 border-red-200',
};

export function DashboardSummaryCards() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchSummary = useCallback(async () => {
    try {
      setError('');
      const data = await getDashboardSummary();
      setSummary(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load summary');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSummary();
    const interval = setInterval(fetchSummary, 60000);
    return () => clearInterval(interval);
  }, [fetchSummary]);

  const { lastEvent } = useSocket();
  useEffect(() => {
    if (!lastEvent) return;
    fetchSummary();
  }, [lastEvent, fetchSummary]);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-32 animate-pulse rounded-2xl border border-white/70 bg-white/70 p-4 shadow-sm">
            <div className="mb-5 h-3 w-20 rounded bg-slate-200" />
            <div className="h-9 w-16 rounded bg-slate-200" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm">
        <p className="text-sm font-medium text-red-700">{error}</p>
        <button onClick={fetchSummary} className="mt-1 text-sm font-semibold text-red-600 underline">
          Retry
        </button>
      </div>
    );
  }

  if (!summary) return null;

  const cards = [
    {
      label: 'Hours This Week',
      value: Number(summary.hours_this_week).toFixed(1),
      unit: 'hrs',
      tone: 'amber' as CardTone,
      detail: 'Logged labor',
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      ),
    },
    {
      label: 'Active Techs',
      value: summary.active_technicians,
      unit: '',
      tone: 'emerald' as CardTone,
      detail: 'Clocked in now',
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      ),
    },
    {
      label: 'Completed Today',
      value: summary.completed_today,
      unit: '',
      tone: 'teal' as CardTone,
      detail: 'Closed work',
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      ),
    },
    {
      label: 'Needs Review',
      value: summary.needs_review_count,
      unit: '',
      tone: 'slate' as CardTone,
      detail: 'Awaiting office',
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 12h6m-6 4h4" />
      ),
    },
    {
      label: 'Late Jobs',
      value: summary.late_jobs_count,
      unit: '',
      tone: (summary.late_jobs_count > 0 ? 'red' : 'slate') as CardTone,
      detail: summary.late_jobs_count > 0 ? 'Needs attention' : 'On track',
      icon: (
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z" />
      ),
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      {cards.map((card) => (
        <div
          key={card.label}
          className={`rounded-2xl border bg-gradient-to-br p-4 shadow-sm transition-transform hover:-translate-y-0.5 ${toneStyles[card.tone]}`}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] opacity-70">{card.label}</p>
              <p className="mt-1 text-xs font-medium opacity-70">{card.detail}</p>
            </div>
            <div className="rounded-xl bg-white/70 p-2 shadow-sm">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                {card.icon}
              </svg>
            </div>
          </div>
          <p className="text-3xl font-black tracking-tight text-slate-950">
            {card.value}
            {card.unit && <span className="ml-1 text-sm font-semibold text-slate-500">{card.unit}</span>}
          </p>
        </div>
      ))}
    </div>
  );
}
