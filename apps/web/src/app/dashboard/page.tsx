import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { DashboardClient } from './DashboardClient';

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
