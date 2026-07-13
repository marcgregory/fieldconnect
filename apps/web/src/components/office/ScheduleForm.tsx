'use client';

import { useState, useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@fieldconnect/ui';
import {
  createScheduleSchema,
  type CreateScheduleInput,
  type UpdateScheduleInput,
  type ScheduleWithDetails,
  type Project,
  type TechnicianAvailability,
} from '@fieldconnect/shared';
import { getProjects, getAvailableTechnicians, getProjectAssignments } from '@/lib/api';
import { z } from 'zod';

type FormValues = z.infer<typeof createScheduleSchema>;

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
  buffer_conflict: { label: 'Buffer conflict', class: 'text-blue-700 bg-blue-50' },
};

const ACTIVE_WORKFLOW_STATUSES = new Set([
  'traveling',
  'on_site',
  'completed',
  'closed',
  'rework_required',
]);

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
  const [serverError, setServerError] = useState('');
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [loadingTechs, setLoadingTechs] = useState(false);
  const [conflictSaving, setConflictSaving] = useState(false);
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

  const isEditing = !!schedule;

  // Determine which technicians have active workflow state and cannot be removed
  const lockedTechIds = useMemo(() => {
    if (!schedule) return new Set<string>();
    return new Set(
      (schedule.technician_workflow || [])
        .filter((w) => ACTIVE_WORKFLOW_STATUSES.has(w.status))
        .map((w) => w.technician_id),
    );
  }, [schedule]);

  const form = useForm<FormValues>({
    resolver: zodResolver(createScheduleSchema),
    defaultValues: {
      project_id: schedule?.project_id || '',
      technician_ids: schedule?.technician_ids || [],
      scheduled_date: schedule?.scheduled_date || defaultDate || '',
      start_time:
        schedule?.start_time?.slice(0, 5) || defaultTime?.slice(0, 5) || '',
      end_time: schedule?.end_time?.slice(0, 5) || '',
      notes: schedule?.notes || '',
    },
  });

  const watchedProjectId = form.watch('project_id');
  const watchedDate = form.watch('scheduled_date');
  const watchedStartTime = form.watch('start_time');
  const watchedEndTime = form.watch('end_time');

  // Default date to today after mount when no value is set
  useEffect(() => {
    const date = form.getValues('scheduled_date');
    if (!date) {
      form.setValue('scheduled_date', new Date().toLocaleDateString('en-CA'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load projects once
  useEffect(() => {
    async function load() {
      try {
        setLoadingProjects(true);
        const proj = await getProjects({ status: 'active' });
        setProjects(proj);
      } catch (err) {
        setServerError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoadingProjects(false);
      }
    }
    load();
  }, []);

  // Load project team members when project changes
  useEffect(() => {
    if (!watchedProjectId) {
      setProjectTeamIds([]);
      return;
    }
    let cancelled = false;
    async function loadTeam() {
      try {
        const team = await getProjectAssignments(watchedProjectId);
        if (!cancelled) {
          setProjectTeamIds(team.map((m: any) => m.user_id));
        }
      } catch {
        if (!cancelled) setProjectTeamIds([]);
      }
    }
    loadTeam();
    return () => {
      cancelled = true;
    };
  }, [watchedProjectId]);

  // Load technicians with availability when date/time changes
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoadingTechs(true);
        const techs = await getAvailableTechnicians(
          watchedDate || undefined,
          watchedStartTime || undefined,
          watchedEndTime || undefined,
        );
        if (!cancelled) setTechnicians(techs);
      } catch (err) {
        if (!cancelled) {
          setServerError(
            err instanceof Error ? err.message : 'Failed to load technicians',
          );
        }
      } finally {
        if (!cancelled) setLoadingTechs(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [watchedDate, watchedStartTime, watchedEndTime]);

  function formatTime(time: string): string {
    const parts = time.split(':');
    const h = parseInt(parts[0], 10);
    const m = parts[1];
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${m} ${ampm}`;
  }

  function buildPayload(values: FormValues, force = false) {
    return {
      project_id: values.project_id,
      technician_ids: values.technician_ids,
      scheduled_date: values.scheduled_date,
      start_time: values.start_time || undefined,
      end_time: values.end_time || undefined,
      notes: values.notes || undefined,
      ...(force ? { force: true } : {}),
    };
  }

  async function handleForceAssign() {
    if (!pendingPayload) return;
    setConflictDialog(null);
    setPendingPayload(null);
    setConflictSaving(true);
    try {
      if ('id' in pendingPayload) {
        await onSaved(pendingPayload);
      } else {
        await onSaved(pendingPayload as CreateScheduleInput);
      }
    } catch (innerErr) {
      const msg2 =
        innerErr instanceof Error ? innerErr.message : 'Failed to force save';
      const innerConflict = innerErr as any;
      if (innerConflict?.conflicts) {
        setConflictDialog({
          message: msg2,
          conflicts: innerConflict.conflicts,
        });
        setPendingPayload(pendingPayload);
      } else {
        setServerError(msg2);
      }
    } finally {
      setConflictSaving(false);
    }
  }

  async function onSubmit(values: FormValues) {
    setServerError('');
    setConflictDialog(null);
    setPendingPayload(null);

    const payload = buildPayload(values);

    try {
      if (isEditing) {
        await onSaved({ id: schedule!.id, ...payload });
      } else {
        await onSaved(payload as CreateScheduleInput);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save';
      const conflictErr = err as any;
      if (conflictErr?.can_force_assign && conflictErr?.conflicts) {
        setConflictDialog({
          message: msg,
          conflicts: conflictErr.conflicts,
        });
        setPendingPayload({
          id: isEditing ? schedule!.id : undefined,
          ...payload,
          force: true,
        });
      } else {
        setServerError(msg);
      }
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
          <svg
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {serverError && (
        <div
          role="alert"
          className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-4 whitespace-pre-line"
        >
          {serverError}
        </div>
      )}

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-4"
          noValidate
        >
          {/* Project */}
          <FormField
            control={form.control}
            name="project_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Project</FormLabel>
                <FormControl>
                  <select
                    {...field}
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
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
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Scheduled Technicians (multi-select) */}
          <FormField
            control={form.control}
            name="technician_ids"
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel>Scheduled Technicians</FormLabel>
                {!watchedProjectId ? (
                  <p className="text-sm text-gray-400 italic">
                    Select a project first...
                  </p>
                ) : projectTeamIds.length === 0 ? (
                  <p className="text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded">
                    No technicians assigned to this project team. Add team members
                    first.
                  </p>
                ) : (
                  <>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2">
                      {technicians
                        .filter((t) => projectTeamIds.includes(t.id))
                        .map((t) => {
                          const isSelected = field.value.includes(t.id);
                          const isLocked = isEditing && lockedTechIds.has(t.id);
                          const avail =
                            AVAILABILITY_LABELS[t.availability] ||
                            AVAILABILITY_LABELS.available;
                          const isBusy = t.availability !== 'available';
                          return (
                            <label
                              key={t.id}
                              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm cursor-pointer transition-colors ${
                                isLocked
                                  ? 'opacity-60 cursor-not-allowed'
                                  : isSelected
                                    ? 'bg-blue-50 border border-blue-300'
                                    : isBusy
                                      ? 'bg-red-50 border border-red-100'
                                      : 'bg-gray-50 border border-transparent hover:border-gray-300'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={isLocked}
                                onChange={() => {
                                  const next = isSelected
                                    ? field.value.filter((id) => id !== t.id)
                                    : [...field.value, t.id];
                                  field.onChange(next);
                                }}
                                className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                              />
                              <span className="font-medium">{t.name}</span>
                              <span
                                className={`ml-auto text-xs font-medium px-1.5 py-0.5 rounded ${avail.class}`}
                              >
                                {avail.label}
                              </span>
                            </label>
                          );
                        })}
                    </div>
                    {field.value.length > 0 && (
                      <p className="text-xs text-gray-500 mt-1">
                        {field.value.length} technician
                        {field.value.length !== 1 ? 's' : ''} selected
                      </p>
                    )}
                    {fieldState.error && <FormMessage />}
                  </>
                )}
              </FormItem>
            )}
          />

          {/* Date */}
          <FormField
            control={form.control}
            name="scheduled_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date</FormLabel>
                <FormControl>
                  <input
                    type="date"
                    {...field}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Time Range */}
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="start_time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Start Time</FormLabel>
                  <FormControl>
                    <input
                      type="time"
                      {...field}
                      value={field.value ?? ''}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="end_time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>End Time</FormLabel>
                  <FormControl>
                    <input
                      type="time"
                      {...field}
                      value={field.value ?? ''}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {/* Notes */}
          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Notes</FormLabel>
                <FormControl>
                  <textarea
                    {...field}
                    value={field.value ?? ''}
                    rows={3}
                    maxLength={2000}
                    placeholder="Optional notes about this schedule entry"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <div>
              {isEditing && onDelete && (
                <button
                  type="button"
                  onClick={() => onDelete(schedule!.id)}
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
                disabled={
                  form.formState.isSubmitting || loadingProjects || loadingTechs
                }
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {form.formState.isSubmitting
                  ? 'Saving...'
                  : isEditing
                    ? 'Update Schedule'
                    : 'Create Schedule'}
              </button>
            </div>
          </div>
        </form>
      </Form>

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
                  <div
                    key={i}
                    className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm"
                  >
                    <p className="font-semibold text-gray-900">
                      {c.technician_name || ''}
                    </p>
                    <p className="text-gray-600">{c.project_name || ''}</p>
                    <p className="text-gray-600">
                      {c.start_time ? formatTime(c.start_time) : ''} —
                      {c.end_time ? formatTime(c.end_time) : ''}
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
                disabled={conflictSaving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {conflictSaving ? 'Saving...' : 'Force Assign'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
