import type { ScheduleWithDetails } from '@fieldconnect/shared';

export function getEvidenceReworkVersion(
  schedule: ScheduleWithDetails,
  technicianId: string | null | undefined,
): number {
  if (!technicianId) return 0;

  const workflow = schedule.technician_workflow?.find(
    (tw) => tw.technician_id === technicianId,
  );

  return workflow?.has_open_rework ? workflow.current_rework_version : 0;
}
