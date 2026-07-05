'use client';

import { useState, useEffect } from 'react';
import { getProjects, getAvailableTechnicians } from '@/lib/api';
import type {
  Project,
  User,
  ScheduleWithDetails,
  CreateScheduleInput,
  UpdateScheduleInput,
} from '@fieldconnect/shared';

interface ScheduleFormProps {
  schedule?: ScheduleWithDetails | null;
  defaultDate?: string | null;
  defaultTime?: string | null;
  onClose: () => void;
  onSaved: (data: CreateScheduleInput | (UpdateScheduleInput & { id: string })) => Promise<void>;
  onDelete?: (id: string) => void;
}

export function ScheduleForm({
  schedule,
  defaultDate,
  defaultTime,
  onClose,
  onSaved,
  onDelete,
}: ScheduleFormProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [technicians, setTechnicians] = useState<User[]>([]);
  const [projectId, setProjectId] = useState(schedule?.project_id || '');
  const [technicianId, setTechnicianId] = useState(schedule?.technician_id || '');
  const [date, setDate] = useState(
    schedule?.scheduled_date || defaultDate || new Date().toLocaleDateString('en-CA'),
  );
  const [startTime, setStartTime] = useState(
    schedule?.start_time?.slice(0, 5) || defaultTime?.slice(0, 5) || '',
  );
  const [endTime, setEndTime] = useState(schedule?.end_time?.slice(0, 5) || '');
  const [notes, setNotes] = useState(schedule?.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const isEditing = !!schedule;

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [proj, techs] = await Promise.all([
          getProjects({ status: 'active' }),
          getAvailableTechnicians(),
        ]);
        setProjects(proj);
        setTechnicians(techs);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    // Validation
    if (!projectId) { setError('Please select a project'); return; }
    if (!technicianId) { setError('Please select a technician'); return; }
    if (!date) { setError('Please select a date'); return; }

    setSaving(true);
    try {
      const payload: any = {
        project_id: projectId,
        technician_id: technicianId,
        scheduled_date: date,
        start_time: startTime || undefined,
        end_time: endTime || undefined,
        notes: notes || undefined,
      };

      if (isEditing) {
        await onSaved({ id: schedule.id, ...payload });
      } else {
        await onSaved(payload as CreateScheduleInput);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          {isEditing ? 'Edit Schedule' : 'New Schedule'}
        </h2>
        <div className="text-center py-8">
          <div className="animate-spin h-6 w-6 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-2" />
          <p className="text-sm text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-gray-900">
          {isEditing ? 'Edit Schedule' : 'New Schedule'}
        </h2>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 hover:text-gray-600"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Project */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select a project...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Technician */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Technician</label>
          <select
            value={technicianId}
            onChange={(e) => setTechnicianId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select a technician...</option>
            {technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>

        {/* Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Time Range */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Optional notes about this schedule entry"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between pt-2">
          <div>
            {isEditing && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(schedule.id)}
                className="text-sm text-red-600 hover:text-red-700 font-medium"
              >
                Delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : isEditing ? 'Update Schedule' : 'Create Schedule'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
