'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();
  const [view, setView] = useState<MobileView>('home');
  const [refreshKey, setRefreshKey] = useState(0);

  const handleStatusChange = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  return (
    <div className="space-y-4">
      {view === 'home' ? (
        <>
          <ClockInOut userId={user.id} onStatusChange={handleStatusChange} />

          <Card title="Quick Links">
            <div className="space-y-3">
              <button
                onClick={() => setView('history')}
                className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-left font-semibold text-slate-700 shadow-sm transition-colors active:bg-stone-100"
              >
                Time History
              </button>
              <button
                onClick={() => router.push('/jobs')}
                className="w-full rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-left font-semibold text-slate-700 shadow-sm transition-colors active:bg-stone-100"
              >
                My Jobs
              </button>
              <button
                className="w-full rounded-2xl border border-slate-200 bg-slate-100/70 px-4 py-3 text-left font-semibold text-slate-400"
                disabled
              >
                Profile
              </button>
            </div>
          </Card>

          <TimeHistory refreshTrigger={refreshKey} />
        </>
      ) : (
        <>
          <button
            onClick={() => setView('home')}
            className="flex items-center gap-1 text-sm font-semibold text-brand-700"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <div className="space-y-4">
            <TimeHistory refreshTrigger={refreshKey} />
          </div>
        </>
      )}
    </div>
  );
}