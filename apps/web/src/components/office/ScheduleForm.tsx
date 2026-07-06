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
        // Admin: show confirmation dialog
        if (confirm(
          `Technician(s) have schedule conflicts:\n${conflictErr.error}\n\nForce assign anyway?`,
        )) {
          // Resubmit with force: true
          try {
            const payload: any = {
              project_id: projectId,
              technician_ids: selectedTechIds,
              scheduled_date: date,
              start_time: startTime || undefined,
              end_time: endTime || undefined,
              notes: notes || undefined,
              force: true,
            };
            if (isEditing) {
              await onSaved({ id: schedule!.id, ...payload });
            } else {
              await onSaved(payload as CreateScheduleInput);
            }
            return;
          } catch (innerErr) {
            setError(innerErr instanceof Error ? innerErr.message : 'Failed to force save');
          }
        }
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
    </div>
  );
}
