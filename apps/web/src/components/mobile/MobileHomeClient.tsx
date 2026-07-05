'use client';

import { signOut } from 'next-auth/react';
import { Button, Card } from '@fieldconnect/ui';

interface MobileHomeClientProps {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

export function MobileHomeClient({ user }: MobileHomeClientProps) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-blue-600 text-white px-4 pt-12 pb-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-lg font-bold">FieldConnect</h1>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="text-white/80 text-sm"
          >
            Sign Out
          </button>
        </div>
        <p className="text-white/80 text-sm">Welcome, {user.name}</p>
      </div>

      {/* Main Actions */}
      <div className="flex-1 px-4 py-6 space-y-4">
        <button
          className="w-full bg-blue-600 text-white rounded-xl py-6 text-xl font-bold shadow-lg active:bg-blue-700 transition-colors"
          disabled
        >
          Clock In
        </button>

        <Card title="Today's Jobs">
          <p className="text-gray-500 text-sm text-center py-4">
            No jobs assigned yet. Time tracking will be available in Sprint 2.
          </p>
        </Card>

        <Card title="Quick Links">
          <div className="space-y-3">
            <button
              className="w-full text-left px-4 py-3 rounded-lg bg-gray-50 text-gray-700 font-medium active:bg-gray-100 transition-colors"
              disabled
            >
              My Schedule
            </button>
            <button
              className="w-full text-left px-4 py-3 rounded-lg bg-gray-50 text-gray-700 font-medium active:bg-gray-100 transition-colors"
              disabled
            >
              Time History
            </button>
            <button
              className="w-full text-left px-4 py-3 rounded-lg bg-gray-50 text-gray-700 font-medium active:bg-gray-100 transition-colors"
              disabled
            >
              Profile
            </button>
          </div>
        </Card>
      </div>
    </div>
  );
}
