import { query, pool } from '../index';
import type { ReworkRequest } from '@fieldconnect/shared';

export class ValidationError extends Error {
  statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = statusCode;
  }
}

// ─── Row Mapper ──────────────────────────────────────────────────────────────

function mapReworkRow(row: any): ReworkRequest {
  return {
    id: row.id,
    schedule_id: row.schedule_id,
    technician_id: row.technician_id,
    technician_name: row.technician_name || undefined,
    rework_version: row.rework_version,
    reason: row.reason,
    requested_by: row.requested_by,
    requested_by_name: row.requested_by_name,
    requested_at: row.requested_at,
    resumed_at: row.resumed_at,
    resolved_at: row.resolved_at,
    status: row.status,
    created_at: row.created_at,
  };
}

// ─── Create Rework Request ──────────────────────────────────────────────────

export async function createReworkRequest(
  scheduleId: string,
  reason: string,
  userId: string,
  technicianId: string,
): Promise<ReworkRequest> {
  const result = await query(
    `WITH next_version AS (
       SELECT COALESCE(MAX(rework_version), 0) + 1 AS version
       FROM rework_requests
       WHERE schedule_id = $1 AND technician_id = $4
     )
     INSERT INTO rework_requests (schedule_id, reason, requested_by, technician_id, rework_version)
     SELECT $1, $2, $3, $4, version FROM next_version
     RETURNING *`,
    [scheduleId, reason, userId, technicianId],
  );
  return mapReworkRow(result.rows[0]);
}

// ─── Find Rework Requests by Schedule ────────────────────────────────────────

export async function findReworkRequestsBySchedule(
  scheduleId: string,
): Promise<ReworkRequest[]> {
  const result = await query(
    `SELECT rr.*,
            u.name AS requested_by_name,
            tech.name AS technician_name
     FROM rework_requests rr
     JOIN users u ON u.id = rr.requested_by
     LEFT JOIN users tech ON tech.id = rr.technician_id
     WHERE rr.schedule_id = $1
     ORDER BY rr.requested_at ASC`,
    [scheduleId],
  );
  return result.rows.map(mapReworkRow);
}

// ─── Get Latest Open Rework Request ──────────────────────────────────────────

export async function getLatestOpenRework(
  scheduleId: string,
  technicianId?: string,
): Promise<ReworkRequest | null> {
  const result = technicianId
    ? await query(
        `SELECT rr.*,
                u.name AS requested_by_name,
                tech.name AS technician_name
         FROM rework_requests rr
         JOIN users u ON u.id = rr.requested_by
         LEFT JOIN users tech ON tech.id = rr.technician_id
         WHERE rr.schedule_id = $1 AND rr.status = 'open' AND rr.technician_id = $2
         ORDER BY rr.requested_at DESC
         LIMIT 1`,
        [scheduleId, technicianId],
      )
    : await query(
        `SELECT rr.*,
                u.name AS requested_by_name,
                tech.name AS technician_name
         FROM rework_requests rr
         JOIN users u ON u.id = rr.requested_by
         LEFT JOIN users tech ON tech.id = rr.technician_id
         WHERE rr.schedule_id = $1 AND rr.status = 'open'
         ORDER BY rr.requested_at DESC
         LIMIT 1`,
        [scheduleId],
      );
  return result.rows[0] ? mapReworkRow(result.rows[0]) : null;
}

// ─── Set Rework Resumed At ──────────────────────────────────────────────────

export async function setReworkResumedAt(
  id: string,
): Promise<ReworkRequest | null> {
  const result = await query(
    `UPDATE rework_requests SET resumed_at = NOW()
     WHERE id = $1 AND status = 'open'
     RETURNING *`,
    [id],
  );
  return result.rows[0] ? mapReworkRow(result.rows[0]) : null;
}

// ─── Resolve Rework Request ──────────────────────────────────────────────────

export async function resolveReworkRequest(
  id: string,
): Promise<ReworkRequest | null> {
  const result = await query(
    `UPDATE rework_requests SET status = 'completed', resolved_at = NOW()
     WHERE id = $1 AND status = 'open'
     RETURNING *`,
    [id],
  );
  return result.rows[0] ? mapReworkRow(result.rows[0]) : null;
}

// ─── Get Current Rework Version ──────────────────────────────────────────────

/**
 * Returns the current rework version for a schedule.
 * 0 = original submission.
 * The version is determined by the count of completed (resolved) rework requests,
 * since each rework cycle increments the version.
 */
export async function getCurrentReworkVersion(
  scheduleId: string,
): Promise<number> {
  const result = await query(
    `SELECT COUNT(*)::int AS version
     FROM rework_requests
     WHERE schedule_id = $1 AND status = 'completed'`,
    [scheduleId],
  );
  return result.rows[0]?.version ?? 0;
}

// ─── Get Next Rework Version ────────────────────────────────────────────────

/**
 * Returns the next rework version for a schedule (current version + 1).
 * Each rework cycle creates a new version, and the open request holds it.
 */
export async function getNextReworkVersion(
  scheduleId: string,
): Promise<number> {
  const current = await getCurrentReworkVersion(scheduleId);
  return current + 1;
}

// ─── Check if Schedule Has Open Rework ───────────────────────────────────────

export async function hasOpenRework(
  scheduleId: string,
): Promise<boolean> {
  const result = await query(
    `SELECT EXISTS (
       SELECT 1 FROM rework_requests
       WHERE schedule_id = $1 AND status = 'open'
     ) AS exists`,
    [scheduleId],
  );
  return result.rows[0]?.exists ?? false;
}
