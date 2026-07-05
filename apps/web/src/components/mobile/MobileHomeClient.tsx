'use client';

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { Card } from '@fieldconnect/ui';
import { ClockInOut } from './ClockInOut';
import { TimeHistory } from './TimeHistory';

interface MobileHomeClientProps {
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

type MobileView = 'home' | 'history';

export function MobileHomeClient({ user }: MobileHomeClientProps) {
  const [view, setView] = useState<MobileView>('home');

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

      {/* Main Content */}
      <div className="flex-1 px-4 py-6 space-y-4">
        {view === 'home' ? (
          <>
            {/* Clock In/Out */}
            <ClockInOut userId={user.id} />

            {/* Today's Jobs / Quick Links */}
            <Card title="Quick Links">
              <div className="space-y-3">
                <button
                  onClick={() => setView('history')}
                  className="w-full text-left px-4 py-3 rounded-lg bg-gray-50 text-gray-700 font-medium active:bg-gray-100 transition-colors"
                >
                  Time History
                </button>
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
                  Profile
                </button>
              </div>
            </Card>

            {/* Today's Activity */}
            <TimeHistory />
          </>
        ) : (
          <>
            <button
              onClick={() => setView('home')}
              className="text-blue-600 font-medium text-sm flex items-center gap-1"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <TimeHistory key={i} />
              ))[0]}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
