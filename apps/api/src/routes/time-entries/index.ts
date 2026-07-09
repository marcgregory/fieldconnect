import type { FastifyInstance } from 'fastify';
import { clockInSchema, clockOutSchema, checkGeofence, formatDistance } from '@fieldconnect/shared';
import { requireRole } from '../../middleware/auth';
import * as timeEntryQueries from '../../db/queries/time-entries';
import * as projectQueries from '../../db/queries/projects';
import { broadcastClockEvent } from '../../websocket';
import { insertActivityEvent } from '../../db/queries/activity-events';

export async function timeEntryRoutes(app: FastifyInstance) {
  // ─── Clock In ───────────────────────────────────────────────────────────
  app.post(
    '/api/v1/time-entries/clock-in',
    { preHandler: [requireRole('field_technician', 'admin')] },
    async (request, reply) => {
      const parsed = clockInSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: parsed.error.errors[0].message,
        });
      }

      // Check that the technician is assigned to this project
      const { project_id, notes, clock_in_lat, clock_in_lng, clock_in_accuracy } = parsed.data;

      // Verify project exists
      const project = await projectQueries.findById(project_id);
      if (!project) {
        return reply.status(404).send({
          success: false,
          error: 'Project not found',
        });
      }

      // Check no active time entry already
      const active = await timeEntryQueries.findActiveByUser(request.user!.id);
      if (active) {
        return reply.status(409).send({
          success: false,
          error: 'You already have an active time entry. Please clock out first.',
          data: { active_entry: active },
        });
      }

      const entry = await timeEntryQueries.clockIn(
        request.user!.id,
        project_id,
        notes,
        clock_in_lat,
        clock_in_lng,
        clock_in_accuracy,
      );

      // Compute geofence status
      const geofence = checkGeofence(
        clock_in_lat,
        clock_in_lng,
        project.latitude,
        project.longitude,
        project.geofence_radius ?? 50,
      );

      // -- Geofence enforcement ------------------------------------------
      // block_clock_in: GPS must be inside geofence (or null/unavailable)
      // require_override: block unless override=true flag is sent
      const geofenceAction = project.geofence_action ?? 'warning';
      if (geofenceAction === 'block_clock_in') {
        if (clock_in_lat == null || clock_in_lng == null) {
          return reply.status(403).send({
            success: false,
            error: 'GPS location is required to clock in -- geofence enforcement is active on this project. Please enable location access on your device.',
          });
        }
        if (geofence.inside_geofence === 'outside') {
          return reply.status(403).send({
            success: false,
            error: `You are ${formatDistance(geofence.distance_meters!)} from the customer site, which is outside the ${project.geofence_radius ?? 50}m geofence. Clock-in is blocked for this project.`,
          });
        }
      } else if (geofenceAction === 'require_override') {
        const override = (parsed.data as any).geofence_override === true;
        if (!override && clock_in_lat != null && clock_in_lng != null && geofence.inside_geofence === 'outside') {
          return reply.status(403).send({
            success: false,
            error: `You are ${formatDistance(geofence.distance_meters!)} from the customer site (outside geofence). An office override is required to clock in.`,
            requires_override: true,
          });
        }
      }

      // Broadcast clock-in event
      broadcastClockEvent({
        type: 'clock_in',
        user_id: request.user!.id,
        user_name: request.user!.name,
        project_id,
        project_name: project.name,
        timestamp: entry.clock_in,
        entry_id: entry.id,
        clock_in_lat,
        clock_in_lng,
      });

      // Persist to activity feed
      await insertActivityEvent({
        event_type: 'clock_in',
        schedule_id: null,
        project_id,
        technician_id: request.user!.id,
        actor_id: request.user!.id,
        message: `${request.user!.name} clocked in at ${project.name}`,
        metadata: {
          project_name: project.name,
          event_type: 'clock_in',
          technician_id: request.user!.id,
          technician_name: request.user!.name,
          actor_id: request.user!.id,
          actor_name: request.user!.name,
        },
      });

      return reply.status(201).send({
        success: true,
        data: {
          ...entry,
          distance_from_site: geofence.distance_meters,
          inside_geofence: geofence.inside_geofence,
        },
      });
    },
  );

  // ─── Clock Out ──────────────────────────────────────────────────────────
  app.post(
    '/api/v1/time-entries/clock-out',
    { preHandler: [requireRole('field_technician', 'admin')] },
    async (request, reply) => {
      const parsed = clockOutSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          success: false,
          error: parsed.error.errors[0].message,
        });
      }

      const { notes, clock_out_lat, clock_out_lng, clock_out_accuracy } = parsed.data;

      // Find the active entry for this user
      const active = await timeEntryQueries.findActiveByUser(request.user!.id);
      if (!active) {
        return reply.status(404).send({
          success: false,
          error: 'No active time entry found',
        });
      }

      const entry = await timeEntryQueries.clockOut(
        active.id,
        notes,
        clock_out_lat,
        clock_out_lng,
        clock_out_accuracy,
      );
      if (!entry) {
        return reply.status(409).send({
          success: false,
          error: 'Could not clock out. Entry may already be closed.',
        });
      }

      // Calculate duration in hours
      const clockInTime = new Date(entry.clock_in).getTime();
      const clockOutTime = new Date(entry.clock_out!).getTime();
      const totalMinutes = (clockOutTime - clockInTime) / 60000;
      const durationHours = Math.round((totalMinutes - entry.break_minutes) / 60 * 100) / 100;

      // Get project name for broadcast
      const project = await projectQueries.findById(entry.project_id);

      // Compute geofence status
      const geofence = checkGeofence(
        clock_out_lat,
        clock_out_lng,
        project?.latitude,
        project?.longitude,
        project?.geofence_radius ?? 50,
      );

      // Broadcast clock-out event
      broadcastClockEvent({
        type: 'clock_out',
        user_id: request.user!.id,
        user_name: request.user!.name,
        project_id: entry.project_id,
        project_name: project?.name || 'Unknown',
        timestamp: entry.clock_out!,
        entry_id: entry.id,
        duration_hours: durationHours,
      });

      // Persist to activity feed
      await insertActivityEvent({
        event_type: 'clock_out',
        schedule_id: null,
        project_id: entry.project_id,
        technician_id: request.user!.id,
        actor_id: request.user!.id,
        message: `${request.user!.name} clocked out at ${project?.name || 'Unknown'} (${durationHours.toFixed(1)}h)`,
        metadata: {
          project_name: project?.name || 'Unknown',
          event_type: 'clock_out',
          technician_id: request.user!.id,
          technician_name: request.user!.name,
          actor_id: request.user!.id,
          actor_name: request.user!.name,
          duration_hours: durationHours,
        },
      });

      return reply.status(200).send({
        success: true,
        data: {
          ...entry,
          duration_hours: durationHours,
          distance_from_site: geofence.distance_meters,
          inside_geofence: geofence.inside_geofence,
        },
      });
    },
  );

  // ─── Get Current Active Entry ───────────────────────────────────────────
  app.get(
    '/api/v1/time-entries/current',
    { preHandler: [requireRole('field_technician', 'admin')] },
    async (request, reply) => {
      const active = await timeEntryQueries.findActiveByUser(request.user!.id);
      return reply.status(200).send({
        success: true,
        data: active || null,
      });
    },
  );

  // ─── List Time Entries ──────────────────────────────────────────────────
  app.get('/api/v1/time-entries', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ success: false, error: 'Authentication required' });
    }

    const { project_id, from, to } = request.query as {
      project_id?: string;
      from?: string;
      to?: string;
    };

    const entries = await timeEntryQueries.findByUser(request.user.id, {
      project_id,
      from,
      to,
    });

    return reply.status(200).send({ success: true, data: entries });
  });
}
