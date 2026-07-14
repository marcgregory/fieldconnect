'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { handleSignOut } from '@/lib/logout';
import type { ReactNode } from 'react';
import { Logo } from '@/components/Logo';

interface NavItem {
  label: string;
  href: string;
  icon: ReactNode;
}

interface OfficeNavProps {
  user: {
    name?: string | null;
    role: string;
  };
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      {children}
    </svg>
  );
}

function buildNavItems(role: string): NavItem[] {
  const items: NavItem[] = [
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

  if (role === 'admin') {
    items.splice(2, 0, {
      label: 'Audit',
      href: '/audit',
      icon: <Icon><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></Icon>,
    });
  }

  return items;
}

export function OfficeNav({ user }: OfficeNavProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const resolvedUser = session?.user ?? user;

  if (!resolvedUser || resolvedUser.role === 'field_technician') {
    return null;
  }

  const NAV_ITEMS = buildNavItems(resolvedUser.role);

  return (
    <nav className="sticky top-0 z-40 border-b border-white/70 bg-stone-50/90 shadow-sm shadow-brand-900/5 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-3 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 py-3 sm:gap-4 sm:py-4">
          <div className="flex items-center justify-between gap-3">
            <Link href="/dashboard" className="flex min-w-0 items-center gap-2">
              <Logo size={26} />
              <div className="min-w-0">
                <p className="truncate text-lg font-black tracking-tight text-slate-950">FieldConnect</p>
                <p className="hidden text-[11px] uppercase tracking-[0.18em] text-slate-500 sm:block">
                  Office Console
                </p>
              </div>
            </Link>

            <div className="flex flex-shrink-0 items-center gap-2 sm:gap-3">
              <div className="hidden text-right md:block">
                <p className="max-w-[160px] truncate text-sm font-semibold text-slate-900">{resolvedUser.name}</p>
                <p className="text-xs capitalize tracking-wide text-slate-500">{resolvedUser.role.replace('_', ' ')}</p>
              </div>
              <button
                onClick={handleSignOut}
                className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-red-200 hover:text-red-600"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>

          <div className="-mx-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex min-w-max items-center gap-2 px-1 sm:flex-wrap sm:gap-2 sm:px-0">
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-label={item.label}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition-all sm:px-3.5 ${
                      isActive
                        ? 'border-brand-200 bg-brand-100 text-brand-900 shadow-sm'
                        : 'border-slate-200/80 bg-white/80 text-slate-600 hover:bg-white hover:text-slate-950'
                    }`}
                  >
                    {item.icon}
                    <span className="hidden sm:inline">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}