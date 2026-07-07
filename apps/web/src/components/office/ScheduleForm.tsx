'use client';

import { useState, useEffect } from 'react';
import { getProjects, getAvailableTechnicians, getProjectAssignments } from '@/lib/api';
import type {
  Project,
  User,
  ScheduleWithDetails,
  CreateScheduleInput,
  UpdateScheduleInput,
  TechnicianAvailability,
} from '@fieldconnect/shared';

interface ScheduleFormProps {
  schedule?: ScheduleWithDetails | null;
  defaultDate?: string | null;
  defaultTime?: string | null;
  onClose: () => void;
  onSaved: (data: CreateScheduleInput | (UpdateScheduleInput & { id: string })) => Promise<void>;
  onDelete?: (id: string) => void;
}

const AVAILABILITY_LABELS: Record<string, { label: string; class: string }> = {
  available: { label: 'Available', class: 'text-green-700 bg-green-50' },
  busy: { label: 'Busy', class: 'text-red-700 bg-red-50' },
  buffer_conflict: { label: 'Buffer conflict', class: 'text-yellow-700 bg-yellow-50' },
};

export function ScheduleForm({
  schedule,
  defaultDate,
  defaultTime,
  onClose,
  onSaved,
  onDelete,
}: ScheduleFormProps) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [technicians, setTechnicians] = useState<TechnicianAvailability[]>([]);
  const [projectTeamIds, setProjectTeamIds] = useState<string[]>([]);
  const [projectId, setProjectId] = useState(schedule?.project_id || '');
  const [selectedTechIds, setSelectedTechIds] = useState<string[]>(schedule?.technician_ids || []);
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
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingTechs, setLoadingTechs] = useState(false);
  const [conflictDialog, setConflictDialog] = useState<{
    message: string;
    conflicts: Array<{
      technician_name: string;
      project_name: string;
      start_time: string;
      end_time: string;
      conflict_type: string;
    }>;
  } | null>(null);
  const [pendingPayload, setPendingPayload] = useState<any>(null);
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  const [techsLoaded, setTechsLoaded] = useState(false);

  const isEditing = !!schedule;

  // Load projects once
  useEffect(() => {
    async function load() {
      try {
        setLoadingProjects(true);
        const [proj] = await Promise.all([
          getProjects({ status: 'active' }),
        ]);
        setProjects(proj);
        setProjectsLoaded(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoadingProjects(false);
      }
    }
    load();
  }, []);

  // Load project team members when project changes
  useEffect(() => {
    if (!projectId) {
      setProjectTeamIds([]);
      return;
    }
    async function loadTeam() {
      try {
        const team = await getProjectAssignments(projectId);
        setProjectTeamIds(team.map((m: any) => m.user_id));
      } catch {
        setProjectTeamIds([]);
      }
    }
    loadTeam();
  }, [projectId]);

  // Load technicians, optionally with availability when time slot is set
  useEffect(() => {
    async function load() {
      try {
        setLoadingTechs(true);
        // Pass date/time so backend returns availability status
        const techs = await getAvailableTechnicians(
          date || undefined,
          startTime || undefined,
          endTime || undefined,
        );
        setTechnicians(techs);
        setTechsLoaded(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load technicians');
      } finally {
        setLoadingTechs(false);
      }
    }
    load();
  }, [date, startTime, endTime]);

  // When projects/technicians load, set selected values from schedule
  useEffect(() => {
    if (schedule && projectsLoaded) {
      setProjectId(schedule.project_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule?.project_id, projectsLoaded]);

  useEffect(() => {
    if (schedule && techsLoaded && technicians.length > 0) {
      setSelectedTechIds(schedule.technician_ids || []);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule?.technician_ids, techsLoaded, technicians.length]);

  function formatTime(time: string): string {
    // Convert "10:45:00" or "10:45" to "10:45 AM"
    const parts = time.split(':');
    const h = parseInt(parts[0], 10);
    const m = parts[1];
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m} ${ampm}`;
  }

  async function handleForceAssign() {
    if (!pendingPayload) return;
    setConflictDialog(null);
    setPendingPayload(null);
    setSaving(true);
    try {
      if ('id' in pendingPayload) {
        await onSaved(pendingPayload);
      } else {
        await onSaved(pendingPayload as CreateScheduleInput);
      }
    } catch (innerErr) {
      const msg2 = innerErr instanceof Error ? innerErr.message : 'Failed to force save';
      // If still a conflict with no force option, show the error directly
      const innerConflict = innerErr as any;
      if (innerConflict?.conflicts) {
        setConflictDialog({
          message: msg2,
          conflicts: innerConflict.conflicts,
        });
        setPendingPayload(pendingPayload);
      } else {
        setError(msg2);
      }
    } finally {
      setSaving(false);
    }
  }

  function toggleTechnician(techId: string) {
    setSelectedTechIds((prev) =>
      prev.includes(techId) ? prev.filter((id) => id !== techId) : [...prev, techId],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    // Validation
    if (!projectId) { setError('Please select a project'); return; }
    if (selectedTechIds.length === 0) { setError('Please select at least one technician'); return; }
    if (!date) { setError('Please select a date'); return; }
    if (startTime && startTime < '06:00') { setError('Schedules cannot start before 6:00 AM.'); return; }
    if (startTime && endTime && endTime <= startTime) { setError('End time must be after start time.'); return; }

    setSaving(true);
    try {
      const payload: any = {
        project_id: projectId,
        technician_ids: selectedTechIds,
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
      const msg = err instanceof Error ? err.message : 'Failed to save';

      // Check if this is a conflict error with can_force_assign flag
      const conflictErr = err as any;
      if (conflictErr?.can_force_assign && conflictErr?.conflicts) {
        // Show a proper conflict dialog instead of window.confirm
        setConflictDialog({
          message: msg,
          conflicts: conflictErr.conflicts,
        });
        setPendingPayload({
          project_id: projectId,
          technician_ids: selectedTechIds,
          scheduled_date: date,
          start_time: startTime || undefined,
          end_time: endTime || undefined,
          notes: notes || undefined,
          force: true,
          ...(isEditing ? { id: schedule!.id } : {}),
        });
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
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
        <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-4 whitespace-pre-line">
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
            disabled={loadingProjects}
          >
            <option value="">Select a project...</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Scheduled Technicians (multi-select) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled Technicians</label>
          {!projectId ? (
            <p className="text-sm text-gray-400 italic">Select a project first...</p>
          ) : projectTeamIds.length === 0 ? (
            <p className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded">
              No technicians assigned to this project team. Add team members first.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2">
              {technicians
                .filter((t) => projectTeamIds.includes(t.id))
                .map((t) => {
                  const isSelected = selectedTechIds.includes(t.id);
                  const avail = AVAILABILITY_LABELS[t.availability] || AVAILABILITY_LABELS.available;
                  const isBusy = t.availability !== 'available';
                  return (
                    <label
                      key={t.id}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-50 border border-blue-300'
                          : isBusy
                            ? 'bg-red-50 border border-red-100'
                            : 'bg-gray-50 border border-transparent hover:border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleTechnician(t.id)}
                        className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      />
                      <span className="font-medium">{t.name}</span>
                      <span className={`ml-auto text-xs font-medium px-1.5 py-0.5 rounded ${avail.class}`}>
                        {avail.label}
                      </span>
                    </label>
                  );
                })}
            </div>
          )}
          {selectedTechIds.length > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              {selectedTechIds.length} technician{selectedTechIds.length !== 1 ? 's' : ''} selected
            </p>
          )}
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
              disabled={saving || loadingProjects || loadingTechs}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : isEditing ? 'Update Schedule' : 'Create Schedule'}
            </button>
          </div>
        </div>
      </form>

      {/* Conflict Force-Assign Modal */}
      {conflictDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-md mx-4">
            <h3 className="text-lg font-semibold text-red-700 mb-3">
              Schedule Conflicts
            </h3>

            <p className="text-sm text-gray-700 mb-4 whitespace-pre-line">
              {conflictDialog.message}
            </p>

            {conflictDialog.conflicts.length > 0 && (
              <div className="space-y-3 mb-4 max-h-60 overflow-y-auto">
                {conflictDialog.conflicts.map((c, i) => (
                  <div key={i} className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm">
                    <p className="font-semibold text-gray-900">{c.technician_name}</p>
                    <p className="text-gray-600">{c.project_name}</p>
                    <p className="text-gray-600">
                      {formatTime(c.start_time)} — {formatTime(c.end_time)}
                    </p>
                    {c.conflict_type && (
                      <p className="text-red-600 text-xs mt-1">
                        {c.conflict_type === 'overlap'
                          ? 'Overlaps with existing job'
                          : 'Minimum 30-minute buffer required'}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  setConflictDialog(null);
                  setPendingPayload(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleForceAssign}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Force Assign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
