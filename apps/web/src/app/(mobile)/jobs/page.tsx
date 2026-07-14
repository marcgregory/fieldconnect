import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { JobQueueClient } from '@/components/mobile/JobQueueClient';

export const metadata = {
  title: 'FieldConnect - My Jobs',
  description: 'View your scheduled and completed jobs',
};

export default async function JobsPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  if (!['field_technician', 'admin'].includes(session.user.role)) {
    redirect('/dashboard');
  }

  return <JobQueueClient />;
}