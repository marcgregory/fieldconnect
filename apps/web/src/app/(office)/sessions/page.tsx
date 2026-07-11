import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { SessionsClient } from './SessionsClient';

export const metadata: Metadata = {
  title: 'Sessions',
  description: 'Manage your active login sessions and devices',
};

export default async function SessionsPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  if (session.user.role === 'field_technician') {
    redirect('/mobile');
  }

  return <SessionsClient />;
}
