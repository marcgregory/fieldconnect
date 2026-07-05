'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Spinner } from '@fieldconnect/ui';
import { getMyJobs } from '@/lib/api';
import { JobCard } from './JobCard';
import type { ScheduleWithDetails } from '@fieldconnect/shared';

type JobTab = 'today' | 'upcoming' | 'completed';

export function JobQueueClient() {
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

  // Categorize jobs
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().slice(0, 10);

  const activeStatuses = new Set(['scheduled', 'traveling', 'on_site']);
  const completedStatuses = new Set(['completed', 'office_review', 'closed']);

  const todayJobs = jobs.filter(
    (j) => j.scheduled_date === todayStr && activeStatuses.has(j.status),
  );
  const upcomingJobs = jobs.filter(
    (j) => j.scheduled_date > todayStr && activeStatuses.has(j.status),
  );
  const completedJobs = jobs.filter((j) => completedStatuses.has(j.status));

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
      <div className="bg-white border-b border-gray-200">
        <div className="flex">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 py-3 text-sm font-medium text-center border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
              <span
                className={`ml-1.5 inline-flex items-center justify-center w-5 h-5 text-xs rounded-full ${
                  activeTab === tab.key
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Job List */}
      <div className="flex-1 px-4 py-4 space-y-3">
        {activeJobs.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-400 text-sm">
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
              onClick={() => handleJobClick(job.id)}
            />
          ))
        )}
      </div>

      {/* Refresh indicator */}
      <div className="px-4 pb-4">
        <button
          onClick={fetchJobs}
          className="w-full py-2 text-xs text-blue-600 font-medium active:text-blue-800"
        >
          Refresh Jobs
        </button>
      </div>
    </div>
  );
}
