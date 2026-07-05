'use client';

import { useRouter } from 'next/navigation';
import { Spinner } from '@fieldconnect/ui';
import { getSchedule } from '@/lib/api';
import type { ScheduleWithDetails } from '@fieldconnect/shared';
import { useState, useEffect, useCallback } from 'react';

interface JobDetailClientProps {
  scheduleId: string;
}

const STATUS_CONFIG: Record<
  string,
  { bg: string; text: string; label: string; step: number }
> = {
  scheduled: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Scheduled', step: 0 },
  traveling: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Traveling', step: 1 },
  on_site: { bg: 'bg-green-100', text: 'text-green-800', label: 'On Site', step: 2 },
  completed: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Completed', step: 3 },
  office_review: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Office Review', step: 4 },
  closed: { bg: 'bg-gray-200', text: 'text-gray-600', label: 'Closed', step: 5 },
};

const STATUS_STEPS = ['scheduled', 'traveling', 'on_site', 'completed', 'office_review', 'closed'];

function formatTime(time: string | null): string {
  if (!time) return '';
  const [h, m] = time.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:${m} ${ampm}`;
}

function formatDate(date: string): string {
  const d = new Date(date + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

export function JobDetailClient({ scheduleId }: JobDetailClientProps) {
  const router = useRouter();
  const [schedule, setSchedule] = useState<ScheduleWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchSchedule = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getSchedule(scheduleId);
      setSchedule(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load job details');
    } finally {
      setLoading(false);
    }
  }, [scheduleId]);

  useEffect(() => {
    fetchSchedule();
  }, [fetchSchedule]);

  function handleStartNavigation() {
    if (!schedule?.project_address) return;
    const encoded = encodeURIComponent(schedule.project_address);
    // iPhone maps, with geo fallback
    const url = `maps://?daddr=${encoded}`;
    window.open(url, '_blank');
  }

  function handleContactCustomer() {
    if (!schedule?.project_contact_phone) return;
    window.open(`tel:${schedule.project_contact_phone}`, '_blank');
  }

  // ─── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Spinner size="lg" />
        <p className="text-sm text-gray-500 mt-3">Loading job details...</p>
      </div>
    );
  }

  // ─── Error ────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="px-4 py-8">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
          <p className="text-red-700 text-sm mb-3">{error}</p>
          <button
            onClick={fetchSchedule}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ─── Not Found ────────────────────────────────────────────────────────────
  if (!schedule) {
    return (
      <div className="px-4 py-8">
        <div className="text-center py-16">
          <h3 className="text-lg font-semibold text-gray-500 mb-1">Job Not Found</h3>
          <p className="text-sm text-gray-400 mb-4">
            This job may have been removed or you don't have access.
          </p>
          <button
            onClick={() => router.push('/jobs')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium"
          >
            Back to Jobs
          </button>
        </div>
      </div>
    );
  }

  const statusConfig = STATUS_CONFIG[schedule.status] || STATUS_CONFIG.scheduled;
  const currentStep = statusConfig.step;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 pt-12 pb-4">
        <button
          onClick={() => router.back()}
          className="text-blue-600 font-medium text-sm flex items-center gap-1 mb-3"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <h1 className="text-xl font-bold text-gray-900">{schedule.project_name}</h1>
        <div className="flex items-center gap-2 mt-2">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}
          >
            {statusConfig.label}
          </span>
          <span className="text-sm text-gray-500">
            {formatDate(schedule.scheduled_date)}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-4 space-y-4">
        {/* Time Range */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
            Time
          </h2>
          {schedule.start_time ? (
            <p className="text-base font-medium text-gray-900">
              {formatTime(schedule.start_time)}
              {schedule.end_time ? ` — ${formatTime(schedule.end_time)}` : ''}
            </p>
          ) : (
            <p className="text-sm text-gray-400 italic">No time set</p>
          )}
        </div>

        {/* Address */}
        {schedule.project_address && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Address
            </h2>
            <p className="text-base font-medium text-gray-900">
              {schedule.project_address}
            </p>
          </div>
        )}

        {/* Contact */}
        {schedule.project_contact_name && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Contact
            </h2>
            <p className="text-base font-medium text-gray-900">
              {schedule.project_contact_name}
            </p>
            {schedule.project_contact_phone && (
              <p className="text-sm text-gray-500 mt-0.5">
                {schedule.project_contact_phone}
              </p>
            )}
          </div>
        )}

        {/* Notes */}
        {schedule.notes && (
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Notes
            </h2>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{schedule.notes}</p>
          </div>
        )}

        {/* Status Progress Stepper */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-4">
            Progress
          </h2>
          <div className="space-y-0">
            {STATUS_STEPS.map((status, index) => {
              const cfg = STATUS_CONFIG[status];
              const isComplete = index <= currentStep;
              const isCurrent = index === currentStep;
              return (
                <div key={status} className="flex items-start gap-3">
                  {/* Step indicator */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold border-2 ${
                        isComplete
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white border-gray-300 text-gray-400'
                      } ${isCurrent ? 'ring-2 ring-blue-300' : ''}`}
                    >
                      {isComplete && index < currentStep ? '✓' : index + 1}
                    </div>
                    {index < STATUS_STEPS.length - 1 && (
                      <div
                        className={`w-0.5 h-6 ${
                          index < currentStep ? 'bg-blue-600' : 'bg-gray-200'
                        }`}
                      />
                    )}
                  </div>
                  {/* Label */}
                  <div className={`pb-5 ${index < currentStep ? 'text-gray-500' : index === currentStep ? 'text-blue-700 font-medium' : 'text-gray-400'}`}>
                    <span className="text-sm">{cfg.label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-4 space-y-3">
        {schedule.project_address && (
          <button
            onClick={handleStartNavigation}
            className="w-full bg-blue-600 text-white rounded-xl py-4 text-base font-semibold shadow-lg active:bg-blue-700 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            Start Navigation
          </button>
        )}
        {schedule.project_contact_phone && (
          <button
            onClick={handleContactCustomer}
            className="w-full bg-white border-2 border-blue-600 text-blue-700 rounded-xl py-4 text-base font-semibold active:bg-blue-50 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            Contact Customer
          </button>
        )}
      </div>
    </div>
  );
}
