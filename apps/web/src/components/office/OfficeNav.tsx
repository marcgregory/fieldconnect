'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import type { ReactNode } from 'react';
import { Logo } from '@/components/Logo';

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      {children}
    </svg>
  );
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: <Icon><path strokeLinecap="round" strokeLinejoin="round" d="M4 13h6V4H4v9zm10 7h6V4h-6v16zM4 20h6v-4H4v4z" /></Icon>,
  },
  {
    label: 'Projects',
    href: '/projects',
    icon: <Icon><path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></Icon>,
  },
  {
    label: 'Schedule',
    href: '/schedule',
    icon: <Icon><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3M5 11h14M6 5h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2z" /></Icon>,
  },
  {
    label: 'Review',
    href: '/review',
    icon: <Icon><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7l7-4z" /></Icon>,
  },
  {
    label: 'Reports',
    href: '/reports',
    icon: <Icon><path strokeLinecap="round" strokeLinejoin="round" d="M4 19V5m0 14h16M8 16v-5m4 5V8m4 8v-3" /></Icon>,
  },
];

export function OfficeNav() {
  const pathname = usePathname();
  const { data: session } = useSession();

  if (!session || session.user.role === 'field_technician') {
    return null;
  }

  return (
    <nav className="sticky top-0 z-40 border-b border-white/70 bg-stone-50/80 shadow-sm shadow-brand-900/5 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          <Link href="/dashboard" className="flex flex-shrink-0 items-center gap-2">
            <Logo size={30} showText />
          </Link>

          <div className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-full border border-slate-200/80 bg-white/70 p-1 shadow-insetline">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-sm font-semibold transition-all ${
                    isActive
                      ? 'border border-brand-200 bg-brand-100 text-brand-900 shadow-sm'
                      : 'text-slate-600 hover:bg-white hover:text-slate-950'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className="flex flex-shrink-0 items-center gap-3">
            <div className="hidden text-right md:block">
              <p className="max-w-[160px] truncate text-sm font-semibold text-slate-900">{session.user.name}</p>
              <p className="text-xs capitalize tracking-wide text-slate-500">{session.user.role.replace('_', ' ')}</p>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-red-200 hover:text-red-600"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}



