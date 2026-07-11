'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@fieldconnect/ui';
import { useSession } from 'next-auth/react';
import { getMyJobs } from '@/lib/api';
import { JobCard } from './JobCard';
import type { ScheduleWithDetails, JobStatus } from '@fieldconnect/shared';
import { useSocket } from '@/hooks/useSocket';
import { useClientDateString } from '@/hooks/useHasMounted';

type JobTab = 'today' | 'upcoming' | 'completed';

/**
 * Extract the current technician's per-technician status from a schedule's
 * technician_workflow array. Falls back to the derived schedule.status if
 * the per-tech entry isn't found (e.g. admin viewing).
 */
function getMyStatus(schedule: ScheduleWithDetails, userId?: string): JobStatus {
  if (!userId) return schedule.status;
  const myEntry = schedule.technician_workflow?.find((tw) => tw.technician_id === userId);
  return myEntry?.status ?? schedule.status;
}

export function JobQueueClient() {
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const router = useRouter();
  const [jobs, setJobs] = useState<ScheduleWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<JobTab>('today');

  const fetchJobs = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getMyJobs();
      setJobs(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // ─── Socket: refetch on job update (status change, reassignment) ──────
  const { onJobUpdate } = useSocket();
  useEffect(() => {
    const unsub = onJobUpdate(() => {
      fetchJobs();
    });
    return unsub;
  }, [onJobUpdate, fetchJobs]);

  // Compute per-technician status for each job (memoized)
  const jobsWithStatus = useMemo(() => {
    return jobs.map((job) => ({
      ...job,
      _myStatus: getMyStatus(job, userId),
    }));
  }, [jobs, userId]);

  // Categorize jobs — use a stable date string on first render to avoid
  // hydration mismatches between server and client timezone/locale.
  const todayStr = useClientDateString();

  const activeStatuses = new Set(['scheduled', 'traveling', 'on_site', 'rework_required']);
  const completedStatuses = new Set(['completed', 'closed']);

  const todayJobs = jobsWithStatus.filter(
    (j) => j.scheduled_date === todayStr && activeStatuses.has(j._myStatus),
  );
  const upcomingJobs = jobsWithStatus.filter(
    (j) => j.scheduled_date > todayStr && activeStatuses.has(j._myStatus),
  );
  const completedJobs = jobsWithStatus.filter((j) => completedStatuses.has(j._myStatus));

  const tabs: { key: JobTab; label: string; count: number }[] = [
    { key: 'today', label: "Today's Jobs", count: todayJobs.length },
    { key: 'upcoming', label: 'Upcoming', count: upcomingJobs.length },
    { key: 'completed', label: 'Completed', count: completedJobs.length },
  ];

  const activeJobs =
    activeTab === 'today'
      ? todayJobs
      : activeTab === 'upcoming'
        ? upcomingJobs
        : completedJobs;

  function handleJobClick(id: string) {
    router.push(`/jobs/${id}`);
  }

  // ─── Loading State ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Spinner size="lg" />
        <p className="text-sm text-gray-500 mt-3">Loading your jobs...</p>
      </div>
    );
  }

  // ─── Error State ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <p className="text-red-700 text-sm mb-3">{error}</p>
          <button
            onClick={fetchJobs}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ─── Empty State ──────────────────────────────────────────────────────────
  if (jobs.length === 0) {
    return (
      <div className="px-4 py-8">
        <div className="text-center py-16">
          <div className="text-gray-300 text-5xl mb-4">
            <svg className="h-16 w-16 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-500 mb-1">No Jobs Yet</h3>
          <p className="text-sm text-gray-400">
            Your scheduled jobs will appear here once assigned.
          </p>
        </div>
      </div>
    );
  }

  // ─── Main Content ─────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-screen">
      {/* Tab Navigation */}
      <div className="border-b border-slate-200 bg-white/90 backdrop-blur-xl">
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 border-b-2 py-3 text-center text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-inset ${
                activeTab === tab.key
                  ? 'border-brand-600 text-brand-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
              <span
                className={`ml-1.5 inline-flex items-center justify-center w-5 h-5 text-xs rounded-full ${
                  activeTab === tab.key
                    ? 'bg-brand-100 text-brand-800'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Job List */}
      <div className="flex-1 space-y-3 px-4 py-4">
        {activeJobs.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-400 text-sm">
              {activeTab === 'today'
                ? 'No jobs scheduled for today.'
                : activeTab === 'upcoming'
                  ? 'No upcoming jobs scheduled.'
                  : 'No completed jobs yet.'}
            </p>
          </div>
        ) : (
          activeJobs.map((job) => (
            <JobCard
              key={job.id}
              schedule={job}
              myStatus={job._myStatus}
              onClick={() => handleJobClick(job.id)}
            />
          ))
        )}
      </div>

      {/* Auto-refreshes via WebSocket — pull down to force refresh */}
      <div className="px-4 pb-4">
        <p className="text-center text-xs text-slate-400">
          Updates arrive in real-time
        </p>
      </div>
    </div>
  );
}


