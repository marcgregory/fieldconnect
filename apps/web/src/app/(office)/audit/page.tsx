import type { Metadata } from 'next';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { AuditClient } from './AuditClient';

export const metadata: Metadata = {
  title: 'Audit Log',
  description: 'View authentication audit events and security activity',
};

export default async function AuditPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  if (session.user.role === 'field_technician') {
    redirect('/mobile');
  }

  // Admin-only page — non-admins get sent to dashboard
  if (session.user.role !== 'admin') {
    redirect('/dashboard');
  }

  return <AuditClient />;
}
