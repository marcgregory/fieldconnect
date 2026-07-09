import type { Viewport } from 'next';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { OfflineIndicator } from '@/components/mobile/OfflineIndicator';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  if (!['field_technician', 'admin'].includes(session.user.role)) {
    redirect('/dashboard');
  }

  return (
    <div className="mx-auto min-h-screen max-w-md bg-stone-50 shadow-2xl shadow-brand-900/10" style={{ maxWidth: '430px' }}>
      {children}
      <OfflineIndicator />
    </div>
  );
}

