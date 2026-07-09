import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { ReportsClient } from '@/components/office/ReportsClient';

export const metadata: Metadata = {
  title: 'Reports',
  description: 'Time reports, technician hours, and project summaries',
};

export default async function ReportsPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  // Only office staff can view reports
  if (session.user.role === 'field_technician') {
    redirect('/mobile');
  }

  return <ReportsClient />;
}
