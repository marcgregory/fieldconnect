'use client';

import Link from 'next/link';
import { Card } from '@fieldconnect/ui';
import { LiveStatusFeed } from '@/components/office/LiveStatusFeed';
import { DashboardSummaryCards } from '@/components/office/DashboardSummaryCards';

export function DashboardClient() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Dashboard</h2>

        {/* Summary Cards */}
        <DashboardSummaryCards />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-6">
          <Card title="Quick Links">
            <div className="space-y-3">
              <Link
                href="/projects"
                className="block p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <p className="text-sm font-medium text-gray-900">Manage Projects</p>
                <p className="text-xs text-gray-500">Create, edit, and assign projects</p>
              </Link>
              <Link
                href="/schedule"
                className="block p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <p className="text-sm font-medium text-gray-900">Schedule</p>
                <p className="text-xs text-gray-500">Assign technicians to jobs</p>
              </Link>
              <Link
                href="/reports"
                className="block p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <p className="text-sm font-medium text-gray-900">Reports</p>
                <p className="text-xs text-gray-500">Time reports and CSV export</p>
              </Link>
            </div>
          </Card>

          <Card title="System Status">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm text-gray-600">Authentication: Active</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm text-gray-600">Time Tracking: Active</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-sm text-gray-600">Scheduling: Active</span>
              </div>
            </div>
          </Card>

          {/* Live Status Feed — takes full width on md+ */}
          <div className="md:col-span-2 lg:col-span-3">
            <LiveStatusFeed />
          </div>
        </div>
      </main>
    </div>
  );
}
