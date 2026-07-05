'use client';

import { useState } from 'react';
import { updateScheduleStatus } from '@/lib/api';
import type { ScheduleWithDetails, JobStatus } from '@fieldconnect/shared';

interface ScheduleReviewPanelProps {
  schedule: ScheduleWithDetails;
  onStatusChange: () => void;
  userRole: string;
}

interface OfficeAction {
  status: JobStatus;
  label: string;
  color: string;
}

const OFFICE_ACTIONS: Record<string, OfficeAction | null> = {
  completed: { status: 'office_review', label: 'Move to Office Review', color: 'bg-purple-600' },
  office_review: { status: 'closed', label: 'Close Job', color: 'bg-gray-700' },
};

export function ScheduleReviewPanel({ schedule, onStatusChange, userRole }: ScheduleReviewPanelProps) {
  const [transitioning, setTransitioning] = useState(false);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');

  const canReview = ['admin', 'office_manager', 'dispatcher'].includes(userRole);
  const rawAction = OFFICE_ACTIONS[schedule.status];

  if (!canReview || !rawAction) {
    return null;
  }

  // Assign to a const so TS narrows past the null
  const action = rawAction;

  async function handleTransition() {
    setTransitioning(true);
    setError('');
    try {
      await updateScheduleStatus(schedule.id, action.status, notes || undefined);
      setNotes('');
      onStatusChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setTransitioning(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
        Review & Close
      </h2>

      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm text-gray-500">Current:</span>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
          {schedule.status === 'completed' ? 'Completed' : schedule.status === 'office_review' ? 'Office Review' : schedule.status}
        </span>
      </div>

      <div className="mb-3">
        <label className="block text-sm text-gray-600 mb-1">
          Notes (optional)
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add any review notes..."
          rows={2}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
        />
      </div>

      {error && (
        <p className="text-red-600 text-sm mb-2">{error}</p>
      )}

      <button
        onClick={handleTransition}
        disabled={transitioning}
        className={`w-full ${action.color} text-white rounded-lg py-3 text-sm font-semibold shadow-sm active:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {transitioning ? 'Updating...' : action.label}
      </button>
    </div>
  );
}
