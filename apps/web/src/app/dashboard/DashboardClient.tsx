'use client';

import { signOut } from 'next-auth/react';
import Link from 'next/link';
import { Button, Card } from '@fieldconnect/ui';
import { LiveStatusFeed } from '@/components/office/LiveStatusFeed';

interface DashboardClientProps {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

export function DashboardClient({ user }: DashboardClientProps) {
  const roleLabels: Record<string, string> = {
    admin: 'Administrator',
    office_manager: 'Office Manager',
    dispatcher: 'Dispatcher',
    field_technician: 'Field Technician',
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">FieldConnect</h1>
            <p className="text-sm text-gray-500">
              {user.name} &middot; {roleLabels[user.role] || user.role}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/projects">
              <Button variant="secondary" size="sm">
                Projects
              </Button>
            </Link>
            <Button variant="ghost" onClick={() => signOut({ callbackUrl: '/login' })}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h2 className="text-2xl font-semibold text-gray-900 mb-6">Dashboard</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <Card title="Welcome">
            <p className="text-gray-600">
              Welcome to FieldConnect. Your role is{' '}
              <span className="font-medium text-gray-900">{roleLabels[user.role] || user.role}</span>.
            </p>
            <div className="mt-4">
              <Link href="/projects">
                <Button variant="primary" size="sm">
                  View Projects
                </Button>
              </Link>
            </div>
          </Card>

          <Card title="Quick Stats">
            <div className="space-y-3">
              <Link
                href="/projects"
                className="block p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
              >
                <p className="text-sm font-medium text-gray-900">Manage Projects</p>
                <p className="text-xs text-gray-500">Create, edit, and assign projects</p>
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
                <span className="h-2 w-2 rounded-full bg-yellow-500" />
                <span className="text-sm text-gray-600">Scheduling: Coming soon</span>
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
