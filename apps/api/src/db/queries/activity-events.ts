import { query } from '../index';

export interface InsertActivityParams {
  event_type: string;
  schedule_id?: string | null;
  project_id?: string | null;
  technician_id?: string | null;
  actor_id?: string | null;
  message: string;
  metadata?: Record<string, unknown> | null;
  /**
   * Retention policy for this event.
   * 'feed' (default) – shown in Live Feed, eligible for 7-day cleanup.
   * 'audit'          – permanent audit-only, not shown in Live Feed.
   * 'both'           – shown in Live Feed AND preserved permanently.
   */
  retention?: 'feed' | 'audit' | 'both';
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
  retention: 'feed' | 'audit' | 'both';
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
  const { event_type, schedule_id, project_id, technician_id, actor_id, message, metadata, retention } = params;

  await query(
    `INSERT INTO activity_events (event_type, schedule_id, project_id, technician_id, actor_id, message, metadata, retention)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      event_type,
      schedule_id ?? null,
      project_id ?? null,
      technician_id ?? null,
      actor_id ?? null,
      message,
      metadata ? JSON.stringify(metadata) : null,
      retention ?? 'feed',
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
       ae.retention,
       tech.name AS technician_name,
       actor.name AS actor_name,
       p.name AS project_name
     FROM activity_events ae
     LEFT JOIN users tech ON tech.id = ae.technician_id
     LEFT JOIN users actor ON actor.id = ae.actor_id
     LEFT JOIN projects p ON p.id = ae.project_id
     WHERE ae.retention IN ('feed', 'both')
     ORDER BY ae.created_at DESC
     LIMIT $1`,
    [cap],
  );

  return result.rows;
}
