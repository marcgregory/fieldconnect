import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { DashboardClient } from './DashboardClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'FieldConnect office dashboard — overview of hours, active technicians, and live job feed',
};

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  // Field technicians should not access the office dashboard
  if (session.user.role === 'field_technician') {
    redirect('/mobile');
  }

  return <DashboardClient />;
}
