import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { JobDetailClient } from '@/components/mobile/JobDetailClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'FieldConnect - Job Details',
  description: 'View job details and actions',
};

export default async function JobDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect('/login');
  }

  if (!['field_technician', 'admin'].includes(session.user.role)) {
    redirect('/dashboard');
  }

  return <JobDetailClient scheduleId={params.id} />;
}