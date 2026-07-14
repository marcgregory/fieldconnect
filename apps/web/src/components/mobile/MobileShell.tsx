'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Logo } from '@/components/Logo';
import { handleSignOut } from '@/lib/logout';

function getHeader(pathname: string) {
  if (pathname.startsWith('/jobs/')) {
    return {
      title: 'Job Details',
      subtitle: 'View job details and actions',
      backHref: '/jobs',
      backLabel: 'Back to jobs',
      showSignOut: false,
    };
  }

  if (pathname === '/jobs') {
    return {
      title: 'My Jobs',
      subtitle: 'Your scheduled and completed work',
      backHref: '/mobile',
      backLabel: 'Back',
      showSignOut: false,
    };
  }

  return {
    title: 'FieldConnect',
    subtitle: null,
    backHref: null,
    backLabel: null,
    showSignOut: true,
  };
}

export function MobileShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const header = getHeader(pathname);
  const isHome = pathname === '/mobile';
  const isJobs = pathname === '/jobs' || pathname.startsWith('/jobs/');

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="sticky top-0 z-30 border-b border-blue-500/20 bg-blue-600 px-4 pb-4 pt-12 text-white shadow-sm">
        {header.backHref ? (
          <Link
            href={header.backHref}
            className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-white/80"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            {header.backLabel}
          </Link>
        ) : (
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Logo size={22} />
              <h1 className="text-lg font-bold tracking-tight">{header.title}</h1>
            </div>
            {header.showSignOut && (
              <button
                onClick={handleSignOut}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-600 shadow-sm"
              >
                Sign Out
              </button>
            )}
          </div>
        )}

        {header.backHref ? (
          <>
            <h1 className="text-lg font-bold tracking-tight">{header.title}</h1>
            {header.subtitle && <p className="mt-1 text-sm text-white/80">{header.subtitle}</p>}
          </>
        ) : (
          <p className="text-sm text-white/80">Welcome, {session?.user?.name ?? 'Technician'}</p>
        )}
      </header>

      <main id="main-content" className="flex-1 px-4 py-6 pb-24">
        {children}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto grid max-w-md grid-cols-3 px-2 py-2" style={{ maxWidth: '430px' }}>
          <Link
            href="/mobile"
            aria-current={isHome ? 'page' : undefined}
            className={`flex flex-col items-center justify-center rounded-2xl px-3 py-2 text-xs font-semibold transition-colors ${
              isHome ? 'bg-brand-50 text-brand-700' : 'text-slate-500'
            }`}
          >
            <svg className="mb-1 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1v-10.5z" />
            </svg>
            Home
          </Link>

          <Link
            href="/jobs"
            aria-current={isJobs ? 'page' : undefined}
            className={`flex flex-col items-center justify-center rounded-2xl px-3 py-2 text-xs font-semibold transition-colors ${
              isJobs ? 'bg-brand-50 text-brand-700' : 'text-slate-500'
            }`}
          >
            <svg className="mb-1 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Jobs
          </Link>

          <button
            type="button"
            disabled
            className="flex flex-col items-center justify-center rounded-2xl px-3 py-2 text-xs font-semibold text-slate-300"
          >
            <svg className="mb-1 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5.121 17.804A9 9 0 1118.88 17.8M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Profile
          </button>
        </div>
      </nav>
    </div>
  );
}