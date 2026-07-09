'use client';

import Link from 'next/link';
import { Card } from '@fieldconnect/ui';
import { LiveStatusFeed } from '@/components/office/LiveStatusFeed';
import { DashboardSummaryCards } from '@/components/office/DashboardSummaryCards';

const quickLinks = [
  {
    href: '/projects',
    label: 'Manage Projects',
    description: 'Create scopes, client records, and site assignments',
    metric: 'Ops',
  },
  {
    href: '/schedule',
    label: 'Dispatch Board',
    description: 'Match technicians to priority field work',
    metric: 'Live',
  },
  {
    href: '/reports',
    label: 'Reports',
    description: 'Export labor, completion, and time evidence',
    metric: 'CSV',
  },
];

export function DashboardClient() {
  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <section className="mb-8 overflow-hidden rounded-[1.75rem] border border-white/70 bg-slate-950 shadow-premium">
          <div className="relative px-6 py-8 sm:px-8 lg:px-10">
            <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_70%_30%,rgba(245,158,11,0.35),transparent_22rem)] md:block" />
            <div className="relative max-w-3xl">
              <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-brand-200">
                <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.8)]" />
                Operations command center
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Field performance, dispatch, and evidence in one view.</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
                Monitor technician coverage, schedule pressure, and job review signals without leaving the office board.
              </p>
            </div>
          </div>
        </section>

        <DashboardSummaryCards />

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card title="Quick Actions" className="lg:col-span-2">
            <div className="grid gap-3 sm:grid-cols-3">
              {quickLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group rounded-2xl border border-slate-200/80 bg-white/70 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:bg-white hover:shadow-lg"
                >
                  <div className="mb-5 flex items-center justify-between">
                    <span className="rounded-full bg-slate-950 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.14em] text-white">{item.metric}</span>
                    <svg className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </div>
                  <p className="text-base font-bold text-slate-950">{item.label}</p>
                  <p className="mt-1 text-sm leading-5 text-slate-500">{item.description}</p>
                </Link>
              ))}
            </div>
          </Card>

          <Card title="System Health">
            <div className="space-y-3">
              {['Authentication', 'Time Tracking', 'Scheduling'].map((label) => (
                <div key={label} className="flex items-center justify-between rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3">
                  <span className="text-sm font-semibold text-slate-700">{label}</span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.14em] text-emerald-700">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    Active
                  </span>
                </div>
              ))}
            </div>
          </Card>

          <div className="lg:col-span-3">
            <LiveStatusFeed />
          </div>
        </div>
      </main>
    </div>
  );
}
