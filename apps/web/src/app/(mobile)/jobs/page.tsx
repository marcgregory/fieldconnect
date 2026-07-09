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
    <div className="flex min-h-screen flex-col bg-stone-50">
      {/* Header */}
      <div className="border-b border-brand-100 bg-gradient-to-br from-white via-brand-50 to-stone-50 px-4 pb-4 pt-12 text-slate-950">
        <h1 className="text-lg font-bold tracking-tight">My Jobs</h1>
      </div>

      {/* Job Queue */}
      <JobQueueClient />
    </div>
  );
}
