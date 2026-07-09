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

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-blue-600 px-4 pb-4 pt-12 text-white">
        <h1 className="text-lg font-bold tracking-tight">My Jobs</h1>
      </div>

      {/* Job Queue */}
      <JobQueueClient />
    </div>
  );
}

