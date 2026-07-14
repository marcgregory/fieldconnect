import Link from 'next/link';
import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { JobQueueClient } from '@/components/mobile/JobQueueClient';

export const dynamic = 'force-dynamic';

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
        <Link
          href="/mobile"
          className="text-white/80 font-medium text-sm flex items-center gap-1 mb-3"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </Link>
        <h1 className="text-lg font-bold tracking-tight">My Jobs</h1>
      </div>

      {/* Job Queue */}
      <JobQueueClient />
    </div>
  );
}