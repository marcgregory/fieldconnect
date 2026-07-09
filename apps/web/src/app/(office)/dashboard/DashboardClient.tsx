'use client';

import Link from 'next/link';
import { Card } from '@fieldconnect/ui';
import { LiveStatusFeed } from '@/components/office/LiveStatusFeed';
import { DashboardSummaryCards } from '@/components/office/DashboardSummaryCards';

const quickLinks = [
  {
    href: '/projects',
    label: 'Manage Projects',
    description: 'Create, edit, and assign projects',
  },
  {
    href: '/schedule',
    label: 'Schedule',
    description: 'Assign technicians to jobs',
  },
  {
    href: '/reports',
    label: 'Reports',
    description: 'Time reports and CSV export',
  },
];

export function DashboardClient() {
  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <section className="mb-6 rounded-2xl border border-white/80 bg-white/90 px-6 py-5 shadow-premium backdrop-blur-xl sm:px-8">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Live
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">Dashboard</h2>
            </div>
          </div>
        </section>

        <DashboardSummaryCards />

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card title="Quick Links">
            <div className="space-y-3">
              {quickLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group block rounded-2xl border border-slate-200/80 bg-white/75 p-3.5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:bg-white hover:shadow-lg"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{item.label}</p>
                      <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
                    </div>
                    <svg className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 transition-transform group-hover:translate-x-1 group-hover:text-brand-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
                    </svg>
                  </div>
                </Link>
              ))}
            </div>
          </Card>

          <Card title="System Status">
            <div className="space-y-2">
              {['Authentication: Active', 'Time Tracking: Active', 'Scheduling: Active'].map((label) => (
                <div key={label} className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2.5">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  <span className="text-sm font-medium text-slate-600">{label}</span>
                </div>
              ))}
            </div>
          </Card>

          <div className="md:col-span-2 lg:col-span-3">
            <LiveStatusFeed />
          </div>
        </div>
      </main>
    </div>
  );
}
