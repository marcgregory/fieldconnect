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
      setTechnicianId(schedule.technician_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedule?.technician_id, techsLoaded, technicians.length]);

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
      const msg = err instanceof Error ? err.message : 'Failed to save';

      // Check if this is a conflict error with can_force_assign flag
      const conflictErr = err as any;
      if (conflictErr?.can_force_assign && conflictErr?.conflicts) {
        // Admin: show confirmation dialog
        if (confirm(
          `Technician has schedule conflicts:\n${conflictErr.error}\n\nForce assign anyway?`,
        )) {
          // Resubmit with force: true
          try {
            const payload: any = {
              project_id: projectId,
              technician_id: technicianId,
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

        {/* Technician */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled Technician</label>
          <select
            value={technicianId}
            onChange={(e) => setTechnicianId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            disabled={!projectId || loadingTechs}
          >
            <option value="">
              {!projectId
                ? 'Select a project first...'
                : projectTeamIds.length === 0
                  ? 'No technicians on project team'
                  : 'Select a technician...'}
            </option>
            {technicians
              .filter((t) => projectTeamIds.includes(t.id))
              .map((t) => {
                const avail = AVAILABILITY_LABELS[t.availability] || AVAILABILITY_LABELS.available;
                return (
                  <option key={t.id} value={t.id}>
                    {t.name} ({avail.label})
                  </option>
                );
              })}
          </select>
          {projectId && projectTeamIds.length === 0 && (
            <p className="text-xs text-amber-700 bg-amber-50 px-2 py-1 rounded mt-1">
              No technicians assigned to this project team. Add team members first.
            </p>
          )}
          {technicianId && date && startTime && (
            (() => {
              const tech = technicians.find((t) => t.id === technicianId);
              if (tech && tech.availability !== 'available') {
                const label = AVAILABILITY_LABELS[tech.availability]?.label || tech.availability;
                return (
                  <div className={`mt-1 px-2 py-1 rounded text-xs font-medium ${
                    tech.availability === 'busy'
                      ? 'text-red-700 bg-red-50'
                      : 'text-yellow-700 bg-yellow-50'
                  }`}>
                    {label}
                    {tech.conflict_schedule && (
                      <span className="ml-1">
                        — {tech.conflict_schedule.project_name} ({tech.conflict_schedule.start_time.slice(0, 5)} — {tech.conflict_schedule.end_time.slice(0, 5)})
                      </span>
                    )}
                  </div>
                );
              }
              return null;
            })()
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
