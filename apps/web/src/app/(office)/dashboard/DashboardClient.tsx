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
        <section className="mb-8 overflow-hidden rounded-[1.5rem] border border-white/80 bg-white/90 shadow-premium backdrop-blur-xl">
          <div className="relative px-6 py-8 sm:px-8 lg:px-10">
            <div className="absolute inset-y-0 right-0 hidden w-1/2 bg-[radial-gradient(circle_at_75%_20%,rgba(168,117,52,0.18),transparent_21rem)] md:block" />
            <div className="relative grid gap-6 lg:grid-cols-[1fr_280px] lg:items-end">
              <div>
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Office operations live
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">FieldConnect Dashboard</h1>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                  A clear office view for dispatch, project progress, technician coverage, and job review signals.
                </p>
              </div>
              <div className="rounded-2xl border border-brand-200 bg-brand-50/80 p-4">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand-700">Today focus</p>
                <p className="mt-2 text-sm leading-5 text-slate-700">Keep schedules current, review completed jobs, and watch late work before it becomes rework.</p>
              </div>
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
                  className="group rounded-2xl border border-slate-200/80 bg-white/75 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:bg-white hover:shadow-lg"
                >
                  <div className="mb-5 flex items-center justify-between">
                    <span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs font-bold uppercase tracking-[0.14em] text-brand-800">{item.metric}</span>
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
