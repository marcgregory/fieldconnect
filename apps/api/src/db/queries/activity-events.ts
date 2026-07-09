import { query } from '../index';

export interface InsertActivityParams {
  event_type: string;
  schedule_id?: string | null;
  project_id?: string | null;
  technician_id?: string | null;
  actor_id?: string | null;
  message: string;
  metadata?: Record<string, unknown> | null;
}

export interface ActivityEvent {
  id: string;
  event_type: string;
  schedule_id: string | null;
  project_id: string | null;
  technician_id: string | null;
  actor_id: string | null;
  message: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  // Joined display names
  technician_name: string | null;
  actor_name: string | null;
  project_name: string | null;
}

/**
 * Insert a single activity event row.
 */
export async function insertActivityEvent(
  params: InsertActivityParams,
): Promise<void> {
  const { event_type, schedule_id, project_id, technician_id, actor_id, message, metadata } = params;

  await query(
    `INSERT INTO activity_events (event_type, schedule_id, project_id, technician_id, actor_id, message, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      event_type,
      schedule_id ?? null,
      project_id ?? null,
      technician_id ?? null,
      actor_id ?? null,
      message,
      metadata ? JSON.stringify(metadata) : null,
    ],
  );
}

/**
 * Find recent activity events with joined display names.
 */
export async function findRecentActivity(
  limit: number = 50,
): Promise<ActivityEvent[]> {
  // Cap at 200 to prevent abuse
  const cap = Math.min(Math.max(1, limit), 200);

  const result = await query(
    `SELECT
       ae.id,
       ae.event_type,
       ae.schedule_id,
       ae.project_id,
       ae.technician_id,
       ae.actor_id,
       ae.message,
       ae.metadata,
       ae.created_at,
       tech.name AS technician_name,
       actor.name AS actor_name,
       p.name AS project_name
     FROM activity_events ae
     LEFT JOIN users tech ON tech.id = ae.technician_id
     LEFT JOIN users actor ON actor.id = ae.actor_id
     LEFT JOIN projects p ON p.id = ae.project_id
     ORDER BY ae.created_at DESC
     LIMIT $1`,
    [cap],
  );

  return result.rows;
}
