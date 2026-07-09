'use client';

import { useState, useCallback } from 'react';
import { signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { Card } from '@fieldconnect/ui';
import { Logo } from '@/components/Logo';
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
    <div className="flex min-h-screen flex-col bg-stone-50">
      <div className="border-b border-brand-100 bg-gradient-to-br from-white via-brand-50 to-stone-50 px-4 pb-7 pt-12 text-slate-950">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Logo size={28} />
            <h1 className="text-lg font-black tracking-tight">FieldConnect</h1>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: '/login' })}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-slate-600 shadow-sm"
          >
            Sign Out
          </button>
        </div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-brand-700">Field console</p>
        <p className="mt-1 text-xl font-bold">Welcome, {user.name}</p>
      </div>

      <div className="-mt-4 flex-1 space-y-4 px-4 pb-6">
        {view === 'home' ? (
          <>
            <ClockInOut userId={user.id} onStatusChange={handleStatusChange} />

            <Card title="Quick Links">
              <div className="space-y-3">
                <button
                  onClick={() => setView('history')}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-left font-bold text-slate-800 shadow-sm transition-colors active:bg-stone-100"
                >
                  Time History
                  <span className="text-slate-400">View</span>
                </button>
                <button
                  onClick={() => router.push('/jobs')}
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-left font-bold text-slate-800 shadow-sm transition-colors active:bg-stone-100"
                >
                  My Jobs
                  <span className="text-brand-700">Open</span>
                </button>
                <button
                  className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-100/70 px-4 py-3 text-left font-bold text-slate-400"
                  disabled
                >
                  Profile
                  <span>Soon</span>
                </button>
              </div>
            </Card>

            <TimeHistory refreshTrigger={refreshKey} />
          </>
        ) : (
          <>
            <button
              onClick={() => setView('home')}
              className="flex items-center gap-1 pt-4 text-sm font-bold text-brand-700"
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
    </div>
  );
}

